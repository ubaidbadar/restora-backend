import AuditEntry from '../models/audit_entry';
import withPerson from './order_timeline_people';

/**
 * Adds recorded order activity in one indexed query for the whole page.
 * Each order keeps the same 200-entry cap as the old timeline endpoint.
 */
export default async function orderTimelines<T extends { _id?: unknown; toJSON?: () => unknown }>(orders: T[]) {
  if (!orders.length) return [];

  const ids = [...new Set(orders.map((order) => String(order._id)))];
  const entries = await AuditEntry.aggregate([
    { $match: { 'target.type': 'order', 'target.id': { $in: ids } } },
    {
      $setWindowFields: {
        partitionBy: '$target.id',
        sortBy: { at: 1 },
        output: { position: { $documentNumber: {} } },
      },
    },
    { $match: { position: { $lte: 200 } } },
    { $sort: { at: 1 } },
    { $project: { action: 1, actor: 1, changes: 1, at: 1, 'target.id': 1 } },
    ...withPerson,
  ]);
  const byOrder = new Map<string, unknown[]>();
  for (const entry of entries) {
    const id = entry.target.id as string;
    const history = byOrder.get(id) ?? [];
    history.push({ _id: String(entry._id), action: entry.action, actor: entry.actor, changes: entry.changes, at: entry.at });
    byOrder.set(id, history);
  }

  return orders.map((order) => ({
    ...(typeof order.toJSON === 'function' ? (order.toJSON() as object) : order),
    timeline: byOrder.get(String(order._id)) ?? [],
  }));
}
