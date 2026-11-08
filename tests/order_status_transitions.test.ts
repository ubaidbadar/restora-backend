import { describe, expect, it } from 'bun:test';
import { canAdvanceOrder, orderTransitionConditions } from '../src/utils/order_status_transition';
import type { OrderStatus } from '../src/constants/order_status';

describe('server-authoritative order transitions', () => {
  const path: OrderStatus[] = ['pending', 'new', 'preparing', 'ready', 'completed'];
  it('advances dine-in and takeaway orders one stage only', () => {
    for (const type of ['dine_in', 'takeaway'] as const) {
      for (let i = 1; i < path.length; i++) {
        expect(canAdvanceOrder(path[i - 1]!, path[i]!, type)).toBe(true);
      }
      expect(canAdvanceOrder('ready', 'out_for_delivery', type)).toBe(false);
    }
  });
  it('requires dispatch for delivery orders', () => {
    expect(canAdvanceOrder('ready', 'out_for_delivery', 'delivery')).toBe(true);
    expect(canAdvanceOrder('out_for_delivery', 'completed', 'delivery')).toBe(true);
    expect(canAdvanceOrder('ready', 'completed', 'delivery')).toBe(false);
  });
  it('rejects reversing and skipping stages', () => {
    for (const type of ['dine_in', 'takeaway', 'delivery'] as const) {
      expect(canAdvanceOrder('ready', 'preparing', type)).toBe(false);
      expect(canAdvanceOrder('new', 'completed', type)).toBe(false);
      expect(canAdvanceOrder('pending', 'ready', type)).toBe(false);
      expect(canAdvanceOrder('completed', 'new', type)).toBe(false);
      expect(canAdvanceOrder('cancelled', 'preparing', type)).toBe(false);
      expect(canAdvanceOrder('new', 'pending', type)).toBe(false);
    }
    expect(orderTransitionConditions('cancelled')).toEqual([]);
    expect(orderTransitionConditions('pending')).toEqual([]);
  });
});
