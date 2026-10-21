import Order, { type IOrder } from '../models/order';

export type OrderEvent = { type: 'order.created' | 'order.updated'; order: IOrder };
type Listener = { restaurantId: string; branchId?: string; send: (event: OrderEvent) => void };

const listeners = new Set<Listener>();
let changeStream: ReturnType<typeof Order.watch> | null = null;

/**
 * One change stream on the orders collection for the whole process, open while anyone listens. It sees every write
 * (from any route, any server process), so routes never announce their own changes. Needs a replica set (Atlas is one);
 * on a standalone MongoDB it fails, says so, and tries again later.
 */
function watchOrders() {
  changeStream = Order.watch([{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }], { fullDocument: 'updateLookup' });
  changeStream.on('change', (change) => {
    if (!('fullDocument' in change) || !change.fullDocument) return;
    // The same shape as GET /orders.
    const order = Order.hydrate(change.fullDocument).toJSON() as IOrder;
    const type = change.operationType === 'insert' ? 'order.created' : 'order.updated';
    for (const listener of listeners) {
      if (listener.restaurantId !== order.restaurantId) continue;
      if (listener.branchId && listener.branchId !== order.branchId) continue;
      listener.send({ type, order });
    }
  });
  changeStream.on('error', (err) => {
    console.error('[Order events] Change stream stopped:', err.message);
    void changeStream?.close();
    changeStream = null;
    setTimeout(() => listeners.size && !changeStream && watchOrders(), 5_000);
  });
}

/** Calls `send` for each order of the restaurant (one branch, when given) created or changed from now on. Answers the unsubscribe. */
export function onOrderEvent(listener: Listener) {
  listeners.add(listener);
  if (!changeStream) watchOrders();
  return () => {
    listeners.delete(listener);
    if (!listeners.size) {
      void changeStream?.close();
      changeStream = null;
    }
  };
}

export default onOrderEvent;
