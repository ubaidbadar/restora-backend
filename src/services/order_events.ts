import type { Model } from 'mongoose';
import Order, { type IOrder } from '../models/order';
import GuestRequest, { type IGuestRequest } from '../models/guest_request';

type Kind = 'order' | 'call';
export type OrderEvent =
  | { type: 'order.created' | 'order.updated'; data: IOrder }
  | { type: 'call.created' | 'call.updated'; data: IGuestRequest };
/** `calls`: also the guests' waiter and bill calls (needs tables:view). */
type Listener = { restaurantId: string; branchId?: string; calls: boolean; send: (event: OrderEvent) => void };

const listeners = new Set<Listener>();
const models: Record<Kind, Model<any>> = { order: Order, call: GuestRequest }; // eslint-disable-line @typescript-eslint/no-explicit-any
const streams: Record<Kind, ReturnType<typeof Order.watch> | null> = { order: null, call: null };

/**
 * One change stream per collection (orders, guest calls) for the whole process, open while anyone listens. It sees
 * every write (from any route, any server process), so routes never announce their own changes. Needs a replica set
 * (Atlas is one); on a standalone MongoDB it fails, says so, and tries again later.
 */
function watch(kind: Kind) {
  const model = models[kind];
  const stream = model.watch([{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }], { fullDocument: 'updateLookup' });
  streams[kind] = stream;
  stream.on('change', (change) => {
    if (!('fullDocument' in change) || !change.fullDocument) return;
    // The same shape as the routes answer.
    const data = model.hydrate(change.fullDocument).toJSON() as OrderEvent['data'];
    const type = `${kind}.${change.operationType === 'insert' ? 'created' : 'updated'}` as OrderEvent['type'];
    for (const listener of listeners) {
      if (listener.restaurantId !== data.restaurantId) continue;
      if (listener.branchId && listener.branchId !== data.branchId) continue;
      if (kind === 'call' && !listener.calls) continue;
      listener.send({ type, data } as OrderEvent);
    }
  });
  stream.on('error', (err) => {
    console.error(`[Order events] ${kind} change stream stopped:`, err.message);
    void stream.close();
    streams[kind] = null;
    setTimeout(() => listeners.size && !streams[kind] && watch(kind), 5_000);
  });
}

/**
 * Calls `send` for each order (and guest call, when asked) of the restaurant, one branch when given, created or changed
 * from now on. Answers the unsubscribe.
 */
export function onOrderEvent(listener: Listener) {
  listeners.add(listener);
  if (!streams.order) watch('order');
  if (!streams.call) watch('call');
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    for (const kind of ['order', 'call'] as const) {
      void streams[kind]?.close();
      streams[kind] = null;
    }
  };
}

export default onOrderEvent;
