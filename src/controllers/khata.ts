import type { Context } from 'hono';
import Customer from '../models/customer';
import KhataEntry from '../models/khata_entry';
import logAudit, { auditActor } from '../utils/audit';
import runInTransaction from '../utils/transaction';
import applyKhata from '../utils/khata';
import httpError from '../utils/http_error';


export async function listCustomerKhata(c: Context) {
  const customerId = c.req.param('id') ?? '';
  const entries = await KhataEntry.find({ customerId }).sort({ createdAt: -1 }).limit(500);
  return c.json(entries);
}

export async function createKhataEntry(c: Context) {
  const customerId = c.req.param('id') ?? '';
  const { type, amount, note } = c.get('validatedJson') as { type: 'payment' | 'adjustment'; amount: number; note?: string | null };
  const user = c.get('user');

  // A payment lowers what they owe; an adjustment is applied as signed.
  const delta = type === 'payment' ? -Math.abs(amount) : amount;
  const { customer, entry } = await runInTransaction((session) =>
    applyKhata({ customerId, delta, type, note: note ?? undefined, byName: user?.name, session })
  );

  await logAudit({
    action: `khata.${type}`,
    actor: auditActor(c),
    target: { type: 'customer', id: customerId, label: customer.name },
    changes: { after: { amount: delta, balanceAfter: entry.balanceAfter } },
  });

  // The client updates the customer card from `customer`.
  return c.json({ ...entry.toJSON(), customer }, 201);
}

export async function reverseKhataEntry(c: Context) {
  const customerId = c.req.param('id') ?? '';
  const entryId = c.req.param('entryId') ?? '';
  const user = c.get('user');

  const customer = await Customer.findById(customerId).catch(() => null);
  if (!customer) {
    return c.json({ message: 'Customer not found' }, 404);
  }

  const { entry, customer: updated } = await runInTransaction(async (session) => {
    // Mark the original as reversed in the same write that checks it, so it cannot be reversed twice.
    const original = await KhataEntry.findOneAndUpdate(
      { _id: entryId, customerId, reversedAt: { $exists: false }, type: { $ne: 'reversal' } },
      { $set: { reversedAt: new Date().toISOString() } },
      { returnDocument: 'after', session }
    ).catch(() => null);
    if (!original) throw httpError(400, 'This entry cannot be reversed (not found, already reversed, or itself a reversal)');

    return applyKhata({
      customerId,
      delta: -original.amount,
      type: 'reversal',
      orderToken: original.orderToken,
      note: `Reversal of entry ${entryId}`,
      byName: user?.name,
      session,
    });
  });

  await logAudit({
    action: 'khata.reversal',
    actor: auditActor(c),
    target: { type: 'khata_entry', id: entryId, label: `Reversal: ${customer.name}` },
    changes: { after: { balanceAfter: entry.balanceAfter } },
  });

  return c.json({ ...entry.toJSON(), customer: updated });
}

export default {
  list: listCustomerKhata,
  create: createKhataEntry,
  reverse: reverseKhataEntry,
};
