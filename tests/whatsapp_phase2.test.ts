import { describe, it, expect } from 'bun:test';
import { paginateWhatsApp } from '../src/utils/whatsapp_menu';
import { whatsappPhone, graphPhone } from '../src/utils/whatsapp_phone';
import { validateWhatsAppLLM } from '../src/utils/whatsapp_match';
import { quoteActionId } from '../src/services/whatsapp_flow';
import { isWhatsAppWindowOpen, WHATSAPP_CUSTOMER_WINDOW_MS } from '../src/utils/whatsapp_window';
import { invoiceMessage, invoicePdf } from '../src/utils/whatsapp_invoice';
import type { IOrder } from '../src/models/order';

describe('WhatsApp category/dish pagination', () => {
  for (const count of [1, 9, 10, 11, 19, 20, 30, 101]) {
    it('shows all ' + count + ' rows without loss or duplicates', () => {
      const input = Array.from({ length: count }, (_, i) => String(i));
      const seen: string[] = [];
      let page = 0;
      for (let i = 0; i < 30; i++) {
        const result = paginateWhatsApp(input, page);
        expect(result.rows.length + (result.next === null ? 0 : 1)).toBeLessThanOrEqual(10);
        seen.push(...result.rows);
        if (result.next === null) break;
        expect(result.next).toBeGreaterThan(page);
        page = result.next;
      }
      expect(seen).toEqual(input);
    });
  }
});
describe('WhatsApp phone normalization', () => {
  it('preserves correct Pakistani recipient across accepted formats', () => {
    expect(whatsappPhone('923001234567')).toBe('03001234567');
    expect(whatsappPhone('+92 300 1234567')).toBe('03001234567');
    expect(whatsappPhone('03001234567')).toBe('03001234567');
    expect(graphPhone('03001234567')).toBe('923001234567');
  });
  it('rejects foreign or malformed numbers', () => {
    expect(whatsappPhone('12345')).toBeNull();
    expect(graphPhone('+14155552671')).toBeNull();
  });
});
describe('Stored-order invoice', () => {
  const order = {
    dailyToken: 42, createdAt: '2026-11-09T10:00:00.000Z', dayKey: '2026-11-09',
    branchId: 'branch', type: 'takeaway', status: 'pending',
    paymentStatus: 'unpaid', subtotal: 2800, discount: 0, taxRate: 0, tax: 0, deliveryFee: 0, total: 2800,
    items: [{ itemId: 'id', name: 'Chicken Karahi', qty: 2, price: 1400 }],
  } as IOrder;
  it('uses order snapshot for itemized totals and payment state', () => {
    const message = invoiceMessage(order, 'Restaurant Test');
    expect(message).toContain('Order #42');
    expect(message).toContain('2 x Chicken Karahi');
    expect(message).toContain('Rs 2800');
    expect(message).toContain('unpaid');
  });
  it('generates a structurally complete PDF from the same stored order', () => {
    const pdf = invoicePdf(order, 'Restaurant Test', 'Lahore');
    const source = Buffer.from(pdf).toString('ascii');
    expect(source.startsWith('%PDF-1.4')).toBe(true);
    expect(source).toContain('Chicken Karahi');
    expect(source).toContain('TOTAL: Rs 2800');
    expect(source).toContain('%%EOF');
    expect(source).toContain('xref');
  });
});

describe('WhatsApp 24-hour policy boundary', () => {
  const now = Date.parse('2026-11-09T12:00:00.000Z');
  it('permits recent customer messages', () => {
    expect(isWhatsAppWindowOpen(new Date(now - 10_000), now)).toBe(true);
  });
  it('rejects exactly 24 hours and older', () => {
    expect(isWhatsAppWindowOpen(new Date(now - WHATSAPP_CUSTOMER_WINDOW_MS), now)).toBe(false);
    expect(isWhatsAppWindowOpen(new Date(now - WHATSAPP_CUSTOMER_WINDOW_MS - 1), now)).toBe(false);
  });
  it('rejects missing, invalid or excessively future timestamps', () => {
    expect(isWhatsAppWindowOpen(null, now)).toBe(false);
    expect(isWhatsAppWindowOpen('not-a-date', now)).toBe(false);
    expect(isWhatsAppWindowOpen(new Date(now + 61_000), now)).toBe(false);
  });
});

describe('Natural-language menu validation', () => {
  const dishes = [
    { id: 'a', name: 'Chicken Karahi', sizes: [{ id: 'as', name: 'Regular', price: 1400 }] },
    { id: 'b', name: 'Zinger Burger', sizes: [{ id: 'bs', name: 'Regular', price: 550 }] },
    { id: 'c', name: 'Spicy Zinger', sizes: [{ id: 'cs', name: 'Regular', price: 650 }] },
    { id: 'd', name: 'Pizza', sizes: [{ id: 'small', name: 'Small', price: 700 }, { id: 'large', name: 'Large', price: 1100 }] },
  ];
  it('accepts a uniquely matched live item and quantity, ignoring invented prices', () => {
    const result = validateWhatsAppLLM('2 chicken karahi please', dishes,
      [{ itemId: 'a', sizeId: 'as', qty: 2, rawName: 'chicken karahi', price: 1 }], []);
    expect(result.selections).toEqual([{ itemId: 'a', sizeId: 'as', qty: 2 }]);
    expect(result.unmatched).toEqual([]);
  });
  it('rejects a real menu ID paired with an unrelated customer phrase', () => {
    const result = validateWhatsAppLLM('2 chicken karahi', dishes,
      [{ itemId: 'b', sizeId: 'bs', qty: 2, rawName: 'chicken karahi' }], []);
    expect(result.selections).toHaveLength(0);
    expect(result.unmatched).toContain('chicken karahi');
  });
  it('clarifies a phrase matching multiple live dishes', () => {
    const result = validateWhatsAppLLM('1 zinger', dishes,
      [{ itemId: 'b', sizeId: 'bs', qty: 1, rawName: 'zinger' }], []);
    expect(result.selections).toHaveLength(0);
    expect(result.unmatched).toContain('zinger');
  });
  it('requires an explicitly identified size when a dish has multiple sizes', () => {
    const result = validateWhatsAppLLM('1 pizza', dishes,
      [{ itemId: 'd', sizeId: 'large', qty: 1, rawName: 'pizza' }], []);
    expect(result.selections).toHaveLength(0);
    expect(result.unmatched[0]).toContain('which size');
  });
  it('accepts an explicitly specified unique size', () => {
    const result = validateWhatsAppLLM('1 large pizza', dishes,
      [{ itemId: 'd', sizeId: 'large', qty: 1, rawName: 'pizza', rawSize: 'large' }], []);
    expect(result.selections).toHaveLength(1);
  });
  it('rejects nonexistent items and invalid quantities', () => {
    const result = validateWhatsAppLLM('2 zinger', dishes,
      [{ itemId: 'other', sizeId: 'bs', qty: -1, rawName: 'zinger' }], ['Unmatched drink']);
    expect(result.selections).toEqual([]);
    expect(result.unmatched).toContain('Unmatched drink');
  });
});

describe('Cart-bound confirm buttons', () => {
  it('rejects replay between identical quoted carts and later generations', () => {
    const fingerprint = JSON.stringify([[{ itemId: 'dish', qty: 2, price: 1400 }], 2800]);
    const first = quoteActionId(fingerprint, 'cart-A:0');
    expect(first.startsWith('confirm:')).toBe(true);
    expect(first).not.toBe(quoteActionId(fingerprint, 'cart-A:1'));
    expect(first).not.toBe(quoteActionId(fingerprint, 'cart-B:0'));
    expect(first).not.toBe(quoteActionId(JSON.stringify([[], 0]), 'cart-A:0'));
  });
});
