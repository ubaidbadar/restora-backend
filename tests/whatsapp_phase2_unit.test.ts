import { describe, expect, it } from 'bun:test';
import { paginateWhatsApp, safeWhatsAppText } from '../src/utils/whatsapp_menu';
import { whatsappPhone, graphPhone } from '../src/utils/whatsapp_phone';
import { invoiceMessage, invoicePdf, invoiceLines } from '../src/utils/whatsapp_invoice';
import type { IOrder } from '../src/models/order';

describe('WhatsApp Phase 2 pure helpers', () => {
  it('normalizes valid Pakistani numbers and rejects invalid ones', () => {
    expect(whatsappPhone('+923001234567')).toBe('03001234567');
    expect(whatsappPhone('923001234567')).toBe('03001234567');
    expect(whatsappPhone('03001234567')).toBe('03001234567');
    expect(graphPhone('03001234567')).toBe('923001234567');
    expect(whatsappPhone('123')).toBeNull();
    expect(graphPhone('not a number')).toBeNull();
  });
  it('paginates menus without dropping the tenth item', () => {
    const entries = Array.from({ length: 24 }, (_, i) => i);
    const page0 = paginateWhatsApp(entries, 0);
    const page1 = paginateWhatsApp(entries, 1);
    const page2 = paginateWhatsApp(entries, 2);
    expect(page0.rows).toEqual(entries.slice(0, 9));
    expect(page0.next).toBe(1);
    expect(page1.rows).toEqual(entries.slice(9, 18));
    expect(page1.next).toBe(2);
    expect(page2.rows).toEqual(entries.slice(18));
    expect(page2.next).toBeNull();
    expect([...page0.rows, ...page1.rows, ...page2.rows]).toEqual(entries);
    expect(paginateWhatsApp(Array.from({ length: 10 }, (_, i) => i), 0).rows).toHaveLength(10);
    expect(paginateWhatsApp(Array.from({ length: 11 }, (_, i) => i), 0).rows).toHaveLength(9);
  });
  it('bounds WhatsApp row titles at 24 characters', () => {
    expect(safeWhatsAppText('a'.repeat(100))).toHaveLength(24);
    expect(safeWhatsAppText('  ')).toBe('Item');
  });
  it('generates an itemized PDF and text bill from the stored order, not chat', () => {
    const order = {
      dailyToken: 123, createdAt: '2026-11-09T12:00:00.000Z',
      items: [
        { itemId: 'a', name: 'Chicken Karahi', qty: 2, price: 1400 },
        { itemId: 'b', name: 'Naan', qty: 1, price: 120 },
      ],
      subtotal: 2920, discount: 0, tax: 0, deliveryFee: 0,
      total: 2920, paymentStatus: 'unpaid', type: 'takeaway',
    } as IOrder;
    const bill = invoiceMessage(order, 'Restaurant A');
    const pdf = new TextDecoder('ascii').decode(invoicePdf(order, 'Restaurant A', 'Street 1'));
    expect(bill).toContain('2 x Chicken Karahi');
    expect(bill).toContain('Rs 2800');
    expect(bill).toContain('Total: Rs 2920');
    expect(pdf.startsWith('%PDF-1.4')).toBe(true);
    expect(pdf).toContain('xref');
    expect(pdf).toContain('%%EOF');
    expect(pdf).toContain('Chicken Karahi');
    expect(pdf).toContain('Restaurant A');
    expect(pdf).toContain('Rs 2920');
    expect(invoiceLines(order, 'Restaurant A')).toContain('TOTAL: Rs 2920');
  });
  it('splits long invoices across valid PDF pages', () => {
    const order = {
      dailyToken: 1, createdAt: '2026-11-09T12:00:00.000Z',
      items: Array.from({ length: 80 }, (_, i) => ({ itemId: String(i), name: 'Dish ' + i, qty: 1, price: 100 })),
      subtotal: 8000, total: 8000, discount: 0, tax: 0, deliveryFee: 0,
      paymentStatus: 'unpaid', type: 'takeaway',
    } as IOrder;
    const pdf = new TextDecoder('ascii').decode(invoicePdf(order, 'Large Restaurant'));
    expect(pdf).toMatch(/\/Count [2-9]/);
  });
});
