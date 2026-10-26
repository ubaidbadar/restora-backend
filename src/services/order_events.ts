import type { Model } from 'mongoose';
import Order, { type IOrder } from '../models/order';
import GuestRequest, { type IGuestRequest } from '../models/guest_request';
import { runWithoutTenant } from '../middlewares/tenant_context';
import isReplicaSet from '../utils/is_replica_set';

type Kind = 'order' | 'call';
export type OrderEvent =
  | { type: 'order.created' | 'order.updated'; data: IOrder }
  | { type: 'call.created' | 'call.updated'; data: IGuestRequest };
/** `calls`: also the guests' waiter and bill calls (needs tables:view). */
type Listener = { restaurantId: string; branchId?: string; tableId?: string; calls: boolean; send: (event: OrderEvent) => void };

type EventDoc<T extends Kind> = T extends 'order' ? IOrder : IGuestRequest;

const KINDS = ['order', 'call'] as const;
const listeners = new Set<Listener>();
/** What watches each collection while anyone listens, as the function that stops it. */
const watchers: Record<Kind, (() => void) | null> = { order: null, call: null };

/** How often a standalone MongoDB is read for changes, and how far back each read looks (a write saved a little late). */
const POLL_MS = 1_500;
const LOOKBACK_MS = 5_000;

/** Sends an order or a call, as the routes answer it, to everyone of its restaurant (and branch) who should see it. */
function announce<T extends Kind>(kind: T, data: EventDoc<T>, created: boolean) {
  const type = `${kind}.${created ? 'created' : 'updated'}` as OrderEvent['type'];
  for (const listener of listeners) {
    if (listener.restaurantId !== data.restaurantId) continue;
    if (listener.branchId && listener.branchId !== data.branchId) continue;
    if (listener.tableId && ('tableId' in data ? data.tableId !== listener.tableId : true)) continue;
    if (kind === 'call' && !listener.calls) continue;
    listener.send({ type, data } as OrderEvent);
  }
}

/**
 * A replica set (Atlas is one): one change stream per collection sees every write, from any route and any server process.
 * If the server turns out not to support them, the collection is polled instead.
 */
function streamModelChanges<T extends Kind>(kind: T, model: Model<EventDoc<T>>) {
  const stream = model.watch([{ $match: { operationType: { $in: ['insert', 'update', 'replace'] } } }], { fullDocument: 'updateLookup' });
  stream.on('change', (change) => {
    if (!('fullDocument' in change) || !change.fullDocument) return;
    announce(kind, model.hydrate(change.fullDocument).toJSON() as EventDoc<T>, change.operationType === 'insert');
  });
  stream.on('error', (err: Error & { code?: number }) => {
    console.error(`[Order events] ${kind} change stream stopped:`, err.message);
    void stream.close();
    if (err.code === 40573 || /replica set/i.test(err.message)) {
      watchers[kind] = pollChanges(kind);
      return;
    }
    watchers[kind] = null;
    setTimeout(() => {
      if (listeners.size && !watchers[kind]) watchers[kind] = watch(kind);
    }, 5_000);
  });
  return () => void stream.close();
}

function streamChanges(kind: Kind) {
  return kind === 'order' ? streamModelChanges('order', Order) : streamModelChanges('call', GuestRequest);
}

/**
 * A standalone MongoDB (a plain mongod) has no change streams: the collection is read every POLL_MS for what changed
 * (every write sets updatedAt), looking LOOKBACK_MS back. `sent` holds each id's last version sent, so none goes twice.
 */
function pollModelChanges<T extends Kind>(kind: T, model: Model<EventDoc<T>>) {
  const startedAt = Date.now();
  const sent = new Map<string, number>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const read = async () => {
    const now = Date.now();
    const from = Math.max(startedAt, now - LOOKBACK_MS);
    try {
      const docs = await runWithoutTenant(() => model.find({ updatedAt: { $gte: new Date(from) } }).sort({ updatedAt: 1 }).limit(500));
      for (const doc of docs) {
        const id = String(doc._id);
        const updatedAtVal = (doc as unknown as { updatedAt?: Date }).updatedAt;
        const createdAtVal = (doc as unknown as { createdAt?: Date }).createdAt;
        const version = updatedAtVal ? new Date(updatedAtVal).getTime() : now;
        if (sent.get(id) === version) continue;
        // New if never sent and made within this read's window (not an old one changed now).
        const created = !sent.has(id) && (createdAtVal ? new Date(createdAtVal).getTime() : now) >= from;
        sent.set(id, version);
        announce(kind, doc.toJSON() as EventDoc<T>, created);
      }
      for (const [id, version] of sent) if (version < now - 2 * LOOKBACK_MS) sent.delete(id);
    } catch (err) {
      console.error(`[Order events] reading changed ${kind}s failed:`, (err as Error).message);
    }
    if (!stopped) timer = setTimeout(read, POLL_MS);
  };

  timer = setTimeout(read, POLL_MS);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

function pollChanges(kind: Kind) {
  return kind === 'order' ? pollModelChanges('order', Order) : pollModelChanges('call', GuestRequest);
}

const watch = (kind: Kind) => (isReplicaSet() ? streamChanges(kind) : pollChanges(kind));

/**
 * Calls `send` for each order (and guest call, when asked) of the restaurant, one branch when given, created or changed
 * from now on. Answers the unsubscribe. The collections are watched only while someone listens.
 */
export function onOrderEvent(listener: Listener) {
  listeners.add(listener);
  for (const kind of KINDS) watchers[kind] ??= watch(kind);
  return () => {
    listeners.delete(listener);
    if (listeners.size) return;
    for (const kind of KINDS) {
      watchers[kind]?.();
      watchers[kind] = null;
    }
  };
}

export default onOrderEvent;
