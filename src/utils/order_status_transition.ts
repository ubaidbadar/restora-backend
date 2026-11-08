import type { OrderStatus } from '../constants/order_status';

/**
 * A status transition is only valid when the persisted order is in the exact
 * preceding stage. The type constraint prevents skipping delivery dispatch.
 * These filters are used in the atomic MongoDB update, not just a stale read.
 */
export type OrderType = 'dine_in' | 'takeaway' | 'delivery';
export type TransitionCondition = { status: OrderStatus; type?: OrderType | { $ne: OrderType } };

export function orderTransitionConditions(target: OrderStatus): TransitionCondition[] {
  switch (target) {
    case 'new': return [{ status: 'pending' }];
    case 'preparing': return [{ status: 'new' }];
    case 'ready': return [{ status: 'preparing' }];
    case 'out_for_delivery': return [{ status: 'ready', type: 'delivery' }];
    case 'completed': return [
      { status: 'ready', type: { $ne: 'delivery' } },
      { status: 'out_for_delivery', type: 'delivery' },
    ];
    // Cancelling has its own audited permissioned endpoint. A guest order cannot
    // be reverted to pending, and completed/cancelled orders never advance.
    case 'pending':
    case 'cancelled': return [];
  }
}
export function canAdvanceOrder(from: OrderStatus, target: OrderStatus, type: OrderType): boolean {
  return orderTransitionConditions(target).some((condition) => condition.status === from &&
    (condition.type === undefined || condition.type === type ||
      (typeof condition.type === 'object' && condition.type.$ne !== type)));
}
