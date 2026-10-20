import type { ClientSession } from 'mongoose';
import Customer from '../models/customer';
import KhataEntry, { type IKhataEntry } from '../models/khata_entry';
import httpError from './http_error';

interface ApplyKhataParams {
  customerId: string;
  /** + adds to what the customer owes, − is a payment or a reversal. */
  delta: number;
  type: IKhataEntry['type'];
  note?: string;
  orderToken?: number;
  byName?: string;
  session?: ClientSession;
  /** Other counters to move in the same atomic update, e.g. `{ totalSpent: 500 }`. */
  alsoInc?: Record<string, number>;
}

/**
 * Moves a customer's khata balance with an atomic `$inc` and writes the ledger line with the balance it produced.
 * Two payments at the same moment can no longer overwrite each other.
 */
export default async function applyKhata(params: ApplyKhataParams) {
  const { customerId, delta, type, note, orderToken, byName, session, alsoInc } = params;
  const customer = await Customer.findOneAndUpdate(
    { _id: customerId },
    { $inc: { khataBalance: delta, ...alsoInc } },
    { returnDocument: 'after', session }
  );
  if (!customer) throw httpError(404, 'Customer not found');

  const [entry] = await KhataEntry.create(
    [
      {
        customerId,
        type,
        amount: delta,
        orderToken,
        note: note || undefined,
        by: byName ? { name: byName } : undefined,
        balanceAfter: customer.khataBalance ?? 0,
      },
    ],
    { session }
  );
  return { customer, entry: entry! };
}
