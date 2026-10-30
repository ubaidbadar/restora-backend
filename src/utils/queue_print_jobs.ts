import MenuItem from '../models/menu_item';
import PrintAgent, { type IPrinter } from '../models/print_agent';
import PrintJob from '../models/print_job';
import type { IOrder } from '../models/order';
import { toObjectId } from './auth_users';
import { getTenantId } from '../middlewares/tenant_context';

/**
 * Makes the slips of an order for the printers of its branch that print `kind`: a kitchen slip per kitchen printer (only
 * its categories' dishes), or the receipt on the receipt printer. `auto` slips are made once per order and printer, so an
 * order syncing twice or accepted twice prints once; a reprint (`auto` false) always makes a new one.
 * Answers how many slips were queued. One read finds the agents and the dishes' categories together.
 * `change` makes a slip of those dishes headed with its label after the token: only what changed after an edit (see
 * kitchen_changes) as "#12 CHANGED", or a reprint as "#12 REPRINT". Its `key` keeps it apart from the order's first slip.
 */
export default async function queuePrintJobs(
  order: IOrder,
  kind: 'kitchen' | 'receipt',
  header: Record<string, unknown>,
  auto: boolean,
  change?: { items: IOrder['items']; label: string; key: string }
) {
  const lines = change?.items ?? order.items;
  if (!lines.length) return 0;
  const itemIds = lines.map((item) => toObjectId(item.itemId)).filter((id) => id !== null);
  const agents = await PrintAgent.aggregate<{ _id: unknown; printers: IPrinter[]; dishes: { _id: unknown; categoryId: string }[] }>([
    { $match: { branchId: order.branchId, lastSeenAt: { $exists: true } } },
    { $lookup: { from: MenuItem.collection.collectionName, pipeline: [{ $match: { restaurantId: getTenantId(), _id: { $in: itemIds } } }, { $project: { categoryId: 1 } }], as: 'dishes' } },
  ]);

  const categoryOf = (itemId: string, dishes: { _id: unknown; categoryId: string }[]) => dishes.find((dish) => String(dish._id) === itemId)?.categoryId;
  const snapshot = JSON.parse(JSON.stringify(order)) as Record<string, unknown> & { items: IOrder['items'] };
  // The token is printed as it is, so every agent, also one installed before changes, prints the label.
  if (change) snapshot.dailyToken = `${order.dailyToken} ${change.label}`;
  const orderKey = (order.clientId || String(order._id)) + (change ? `~${change.key}` : '');

  const jobs = agents.flatMap((agent) =>
    agent.printers
      .filter((printer) => printer.present && printer.prints.includes(kind))
      .flatMap((printer) => {
        // A kitchen printer with categories gets only their dishes; a slip with no dish is not printed.
        const items = kind === 'kitchen' && printer.categoryIds.length ? lines.filter((item) => printer.categoryIds.includes(categoryOf(item.itemId, agent.dishes) ?? '')) : lines;
        if (!items.length) return [];
        const agentId = String(agent._id);
        return [
          {
            branchId: order.branchId,
            agentId,
            printer: printer.systemName,
            kind,
            orderId: String(order._id),
            orderKey,
            width: printer.width,
            copies: printer.copies,
            order: { ...snapshot, items: JSON.parse(JSON.stringify(items)) },
            header,
            autoKey: auto ? `${agentId}|${printer.systemName}|${kind}|${orderKey}` : undefined,
          },
        ];
      })
  );
  if (!jobs.length) return 0;

  // ordered: false, so the slips already made (duplicate autoKey) are skipped and the rest are still queued.
  try {
    const saved = await PrintJob.insertMany(jobs, { ordered: false });
    return saved.length;
  } catch (err) {
    const written = (err as { insertedDocs?: unknown[] }).insertedDocs;
    if ((err as { code?: number }).code === 11000 || written) return written?.length ?? 0;
    throw err;
  }
}
