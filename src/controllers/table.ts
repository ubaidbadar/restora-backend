import type { Context } from 'hono';
import Table from '../models/table';
import Order from '../models/order';
import Reservation from '../models/reservation';
import GuestRequest from '../models/guest_request';
import logAudit from '../utils/audit';
import dayKey from '../utils/day_key';
import randomToken from '../utils/random_token';
import resolveBranchId from '../utils/resolve_branch';

/** The random part of a table's QR link (/t/<code>): 96 bits from the CSPRNG, URL-safe. */
const newQrCode = () => randomToken(12);

export async function listTables(c: Context) {
  const branchId = c.get('branchId') as string | undefined;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};
  if (branchId) filter.branchId = branchId;

  if (c.req.query('all') !== 'true') {
    filter.archived = false;
  }

  const tables = await Table.find(filter).sort({ name: 1 });
  return c.json(tables);
}

export async function getFloorTables(c: Context) {
  const branchId = c.get('branchId') as string | undefined;

  if (!branchId) {
    return c.json({ message: 'Active branch is required' }, 400);
  }

  const today = dayKey();
  const now = Date.now();
  const minTime = new Date(now - 30 * 60 * 1000).toISOString();
  const maxTime = new Date(now + 90 * 60 * 1000).toISOString();

  // 1. Every table of the branch. Archived ones come last, with nothing going on, so the Tables page can offer to
  //    bring them back without a second request.
  const allTables = await Table.find({ branchId }).sort({ name: 1 });
  const tables = allTables.filter((t) => !t.archived);
  const tableIds = tables.map((t) => String(t._id));

  // 2. Fetch today's open dine-in orders
  const orders = await Order.find({
    branchId,
    dayKey: today,
    type: 'dine_in',
    status: { $ne: 'cancelled' },
    $or: [{ status: { $ne: 'completed' } }, { paymentStatus: { $ne: 'paid' } }],
    tableId: { $in: tableIds },
  });

  // 3. Fetch open guest requests
  const requests = await GuestRequest.find({
    branchId,
    resolved: false,
    tableId: { $in: tableIds },
  });

  // 4. Fetch bookings in window [-30min, +90min]
  const reservations = await Reservation.find({
    branchId,
    status: { $nin: ['cancelled', 'seated'] },
    dateTime: { $gte: minTime, $lte: maxTime },
    tableId: { $in: tableIds },
  }).sort({ dateTime: 1 });

  // 5. Group and merge into FloorTable shape
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const ordersByTable = new Map<string, any[]>();
  for (const o of orders) {
    if (!o.tableId) continue;
    const list = ordersByTable.get(o.tableId) || [];
    list.push({
      _id: String(o._id),
      dailyToken: o.dailyToken,
      total: o.total,
      status: o.status,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt,
    });
    ordersByTable.set(o.tableId, list);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestsByTable = new Map<string, any[]>();
  for (const r of requests) {
    const list = requestsByTable.get(r.tableId) || [];
    list.push({
      _id: String(r._id),
      type: r.type,
      createdAt: r.createdAt,
    });
    requestsByTable.set(r.tableId, list);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bookingByTable = new Map<string, any>();
  for (const b of reservations) {
    if (b.tableId && !bookingByTable.has(b.tableId)) {
      bookingByTable.set(b.tableId, {
        _id: String(b._id),
        dateTime: b.dateTime,
        partySize: b.partySize,
      });
    }
  }

  const floorTables = [...tables, ...allTables.filter((t) => t.archived)].map((t) => {
    const tId = String(t._id);
    return {
      _id: tId,
      name: t.name,
      section: t.section,
      seats: t.seats,
      qrCode: t.qrCode,
      archived: t.archived,
      orders: ordersByTable.get(tId) || [],
      requests: requestsByTable.get(tId) || [],
      booking: bookingByTable.get(tId) || null,
    };
  });

  return c.json(floorTables);
}

export async function createTable(c: Context) {
  const body = c.get('validatedJson');
  const branchId = await resolveBranchId(c, body.branchId);

  const qrCode = newQrCode();
  const table = await Table.create({
    name: body.name,
    section: body.section,
    seats: body.seats,
    branchId,
    qrCode,
    archived: false,
  });

  const user = c.get('user');
  await logAudit({
    action: 'table.created',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'table', id: String(table._id), label: table.name },
  });

  return c.json(table, 201);
}

export async function batchCreateTables(c: Context) {
  const body = c.get('validatedJson') as { branchId?: string; names: string[]; section: string; seats?: number | null };
  const branchId = await resolveBranchId(c, body.branchId);

  const existingTables = await Table.find({ branchId, archived: false });
  const usedNames = new Set(existingTables.map((t) => t.name.toLowerCase()));

  const toInsert: Array<Record<string, unknown>> = [];
  for (const name of body.names) {
    if (usedNames.has(name.toLowerCase())) continue;
    usedNames.add(name.toLowerCase());
    toInsert.push({ branchId, name, section: body.section, seats: body.seats ?? null, qrCode: newQrCode(), archived: false });
  }

  const created = toInsert.length > 0 ? await Table.insertMany(toInsert) : [];

  const user = c.get('user');
  await logAudit({
    action: 'table.batch_created',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'table', label: `Batch: ${created.length} tables` },
  });

  // The client appends what comes back to its list.
  return c.json(created, 201);
}

export async function updateTable(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = c.get('validatedJson');
  if (body.branchId) body.branchId = await resolveBranchId(c, body.branchId);

  const table = await Table.findByIdAndUpdate(id, { $set: body }, { returnDocument: 'after' });
  if (!table) {
    return c.json({ message: 'Table not found' }, 404);
  }

  const user = c.get('user');
  await logAudit({
    action: 'table.updated',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'table', id, label: table.name },
  });

  return c.json(table);
}

export async function regenerateTableQr(c: Context) {
  const id = c.req.param('id') ?? '';
  const table = await Table.findById(id);
  if (!table) {
    return c.json({ message: 'Table not found' }, 404);
  }

  table.qrCode = newQrCode();
  await table.save();

  const user = c.get('user');
  await logAudit({
    action: 'table.qr_regenerated',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'table', id, label: table.name },
  });

  return c.json(table);
}

export async function deleteTable(c: Context) {
  const id = c.req.param('id') ?? '';
  const table = await Table.findById(id);
  if (!table) {
    return c.json({ message: 'Table not found' }, 404);
  }

  table.archived = true;
  await table.save();

  const user = c.get('user');
  await logAudit({
    action: 'table.archived',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'table', id, label: table.name },
  });

  return c.json(table);
}

export async function restoreTable(c: Context) {
  const id = c.req.param('id') ?? '';
  const table = await Table.findByIdAndUpdate(id, { $set: { archived: false } }, { returnDocument: 'after' });
  if (!table) {
    return c.json({ message: 'Table not found' }, 404);
  }

  const user = c.get('user');
  await logAudit({
    action: 'table.restored',
    actor: { name: user?.name, via: 'web' },
    target: { type: 'table', id, label: table.name },
  });

  return c.json(table);
}

export default {
  list: listTables,
  restore: restoreTable,
  getFloor: getFloorTables,
  create: createTable,
  batchCreate: batchCreateTables,
  update: updateTable,
  regenerateQr: regenerateTableQr,
  delete: deleteTable,
};
