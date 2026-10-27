import type { Context } from 'hono';
import Order from '../models/order';
import httpError from '../utils/http_error';
import printHeader from '../utils/print_header';
import queuePrintJobs from '../utils/queue_print_jobs';

/** Print (or print again) an order's kitchen slips or receipt on the branch's printers. 409 when no printer is set up for it, so the app prints in the browser instead. */
export async function createPrintJob(c: Context) {
  const { orderId, kind } = c.get('validatedJson') as { orderId: string; kind: 'kitchen' | 'receipt' };
  const order = await Order.findById(orderId).catch(() => null);
  if (!order) throw httpError(404, 'Order not found');

  const queued = await queuePrintJobs(order, kind, printHeader(c), false);
  if (!queued) return c.json({ message: `No printer is set up for ${kind === 'kitchen' ? 'kitchen slips' : 'receipts'}`, queued: 0 }, 409);
  return c.json({ queued }, 201);
}

export default { create: createPrintJob };
