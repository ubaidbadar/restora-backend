import type { Context } from 'hono';
import Customer from '../models/customer';
import KhataEntry from '../models/khata_entry';
import Order from '../models/order';
import Reservation from '../models/reservation';
import logAudit from '../utils/audit';
import normalizePhone from '../utils/normalize_phone';
import runInTransaction from '../utils/transaction';
import escapeRegex from '../utils/escape_regex';
import applyKhata from '../utils/khata';

const auditActor = (c: Context) => ({ name: c.get('user')?.name, via: (c.get('via') ?? 'web') as 'web' | 'pos' });


export async function listCustomers(c: Context) {
  const query = c.req.query('q')?.trim().slice(0, 60);
  const segment = c.req.query('segment');

  const conditions: Record<string, unknown>[] = [];

  if (query) {
    const normalized = normalizePhone(query);
    // Part of a number ("0300 12", "+92 300"): numbers are saved as +923…, so search by the digits after the prefix.
    const digits = /^[\d\s+\-().]+$/.test(query) ? query.replace(/\D/g, '').replace(/^(?:0092|92|0)(?=3)/, '') : '';
    const pattern = new RegExp(escapeRegex(query), 'i');
    conditions.push(
      normalized
        ? { $or: [{ phone: normalized }, { altPhone: normalized }, { altPhone: pattern }] }
        : digits.length >= 3
          ? { $or: [{ phone: new RegExp(digits) }, { altPhone: new RegExp(digits) }] }
          : { $or: [{ name: pattern }, { phone: pattern }, { area: pattern }] }
    );
  }

  if (segment === 'inactive') {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000).toISOString();
    conditions.push({ $or: [{ lastOrderAt: { $lte: thirtyDaysAgo } }, { lastOrderAt: { $exists: false } }] });
  } else if (segment === 'vip') {
    conditions.push({ tags: { $in: ['VIP', 'vip', 'Vip'] } });
  } else if (segment === 'khata') {
    conditions.push({ khataBalance: { $gt: 0 } });
  }

  // Lists leave out addresses and notes; the profile has them.
  const customers = await Customer.find(conditions.length ? { $and: conditions } : {})
    .select('-addresses -notes')
    .sort({ lastOrderAt: -1, createdAt: -1 })
    .limit(1000);

  return c.json(customers);
}

export async function getCustomer(c: Context) {
  const id = c.req.param('id') ?? '';
  // Profile/detail response includes addresses and notes
  const customer = await Customer.findById(id).catch(() => null);
  if (!customer) {
    return c.json({ message: 'Customer not found' }, 404);
  }
  return c.json(customer);
}

export async function createCustomer(c: Context) {
  const { openingKhata, ...customerData } = c.get('validatedJson');

  const existing = await Customer.findOne({ phone: customerData.phone });
  if (existing) {
    return c.json({ message: 'A customer with this phone number already exists' }, 409);
  }

  const user = c.get('user');
  const customer = await runInTransaction(async (session) => {
    const [created] = await Customer.create([{ ...customerData, khataBalance: 0 }], { session });
    if (!openingKhata) return created!;
    const { customer } = await applyKhata({
      customerId: String(created!._id),
      delta: openingKhata,
      type: 'opening',
      byName: user?.name,
      session,
    });
    return customer;
  });

  await logAudit({
    action: 'customer.created',
    actor: auditActor(c),
    target: { type: 'customer', id: String(customer._id), label: customer.name },
  });

  return c.json(customer, 201);
}

export async function updateCustomer(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson');

  const before = await Customer.findById(id).catch(() => null);
  if (!before) {
    return c.json({ message: 'Customer not found' }, 404);
  }

  if (body.phone && body.phone !== before.phone) {
    const duplicate = await Customer.findOne({ phone: body.phone, _id: { $ne: id } });
    if (duplicate) {
      return c.json({ message: 'Another customer already has this mobile number' }, 409);
    }
  }

  const updated = await Customer.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });

  const user = c.get('user');
  await logAudit({
    action: 'customer.updated',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'customer', id, label: updated?.name },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    changes: { before: before.toObject() as any, after: updated?.toObject() as any },
  });

  return c.json(updated);
}

export async function deleteCustomer(c: Context) {
  const id = c.req.param('id') ?? '';
  const customer = await Customer.findById(id).catch(() => null);
  if (!customer) {
    return c.json({ message: 'Customer not found' }, 404);
  }
  if ((customer.khataBalance ?? 0) !== 0) {
    return c.json({ message: `${customer.name} has a khata balance. Settle it before deleting.` }, 400);
  }

  await Customer.deleteOne({ _id: customer._id });

  const user = c.get('user');
  await logAudit({
    action: 'customer.deleted',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'customer', id, label: customer.name },
  });

  return c.json({ success: true, message: 'Customer deleted' });
}

export async function importCustomers(c: Context) {
  const { customers, onExisting } = c.get('validatedJson') as {
    customers: { name?: string; phone?: string; area?: string; openingKhata?: number | null }[];
    onExisting: 'skip' | 'fill';
  };
  const user = c.get('user');

  let added = 0;
  let filled = 0;
  const skipped: { row: number; reason: string }[] = [];
  const seen = new Set<string>();

  for (const [index, row] of customers.entries()) {
    const rowNum = index + 1;

    if (!row.name) {
      skipped.push({ row: rowNum, reason: 'Missing name' });
      continue;
    }
    const phone = normalizePhone(row.phone ?? '');
    if (!phone) {
      skipped.push({ row: rowNum, reason: row.phone ? `Invalid phone "${row.phone}"` : 'Missing phone' });
      continue;
    }
    if (seen.has(phone)) {
      skipped.push({ row: rowNum, reason: 'Same number as an earlier row' });
      continue;
    }
    seen.add(phone);

    const existing = await Customer.findOne({ phone });

    if (existing) {
      if (onExisting !== 'fill') {
        skipped.push({ row: rowNum, reason: 'Already exists' });
        continue;
      }
      const fill: Record<string, string> = {};
      if (!existing.area && row.area) fill.area = row.area;
      if (Object.keys(fill).length) {
        await Customer.updateOne({ _id: existing._id }, { $set: fill });
        filled++;
      } else {
        skipped.push({ row: rowNum, reason: 'Already exists (nothing to fill)' });
      }
      continue;
    }

    await runInTransaction(async (session) => {
      const [created] = await Customer.create(
        [{ name: row.name, phone, area: row.area, khataBalance: 0, source: 'import', tags: [], addresses: [] }],
        { session }
      );
      if (row.openingKhata) {
        await applyKhata({ customerId: String(created!._id), delta: row.openingKhata, type: 'opening', byName: user?.name, session });
      }
    });
    added++;
  }

  await logAudit({
    action: 'customers.imported',
    actor: auditActor(c),
    target: { type: 'customer', label: `${added} added, ${filled} filled` },
  });

  return c.json({ added, filled, skipped });
}

/**
 * One person saved twice: the other record's orders, bookings and khata move to this one, its totals are added,
 * its number is kept as this one's second number (if that is free) and it is deleted. Answers with the kept customer.
 */
export async function mergeCustomer(c: Context) {
  const id = c.req.param('id') ?? '';
  const { customerId } = c.get('validatedJson') as { customerId: string };
  if (customerId === id) return c.json({ message: 'Pick another customer to merge' }, 400);

  const [keep, other] = await Promise.all([Customer.findById(id).catch(() => null), Customer.findById(customerId).catch(() => null)]);
  if (!keep || !other) return c.json({ message: 'Customer not found' }, 404);

  const merged = await runInTransaction(async (session) => {
    const move = { $set: { customerId: String(keep._id) } };
    await Promise.all([
      Order.updateMany({ customerId: String(other._id) }, move, { session }),
      Reservation.updateMany({ customerId: String(other._id) }, move, { session }),
      KhataEntry.updateMany({ customerId: String(other._id) }, move, { session }),
    ]);
    keep.orderCount = (keep.orderCount ?? 0) + (other.orderCount ?? 0);
    keep.totalSpent = (keep.totalSpent ?? 0) + (other.totalSpent ?? 0);
    keep.khataBalance = (keep.khataBalance ?? 0) + (other.khataBalance ?? 0);
    if (other.lastOrderAt && (!keep.lastOrderAt || other.lastOrderAt > keep.lastOrderAt)) keep.lastOrderAt = other.lastOrderAt;
    if (!keep.altPhone) keep.altPhone = other.phone;
    keep.tags = [...new Set([...(keep.tags ?? []), ...(other.tags ?? [])])];
    await Customer.deleteOne({ _id: other._id }, { session });
    await keep.save({ session });
    return keep;
  });

  await logAudit({
    action: 'customer.merged',
    actor: auditActor(c),
    target: { type: 'customer', id, label: `${other.name} into ${keep.name}` },
  });

  return c.json(merged);
}

export default {
  list: listCustomers,
  get: getCustomer,
  create: createCustomer,
  update: updateCustomer,
  delete: deleteCustomer,
  import: importCustomers,
  merge: mergeCustomer,
};
