import type { Context } from 'hono';
import Table from '../models/table';
import Order from '../models/order';
import Reservation from '../models/reservation';
import GuestRequest from '../models/guest_request';
import logAudit from '../utils/audit';
import dayKey from '../utils/day_key';
import Restaurant from '../models/restaurant';
import resolveBranchId from '../utils/resolve_branch';
import lookup from '../utils/lookup';
import tableCode from '../utils/table_code';

/** The restaurant's name, for its tables' QR links. */
const restaurantName = async (c: Context) => (await Restaurant.findById(c.get('restaurantId')))?.name ?? '';

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

  // One aggregation: every table of the branch with what is going on at it. Archived ones come last, with nothing
  // going on, so the Tables page can offer to bring them back without a second request.
  const scope = { restaurantId: c.get('restaurantId') as string, branchId };
  const asId = { $toString: '$_id' };
  const floorTables = await Table.aggregate([
    { $match: { branchId } },
    { $sort: { archived: 1, name: 1 } },
    { $set: { _id: asId } },
    // Today's dine-in orders still open: not cancelled, and not both completed and paid.
    ...lookup({
      from: Order,
      localField: '_id',
      foreignField: 'tableId',
      as: 'orders',
      pipeline: [
        { $match: { ...scope, dayKey: today, type: 'dine_in', status: { $ne: 'cancelled' }, $or: [{ status: { $ne: 'completed' } }, { paymentStatus: { $ne: 'paid' } }] } },
        { $project: { _id: asId, dailyToken: 1, total: 1, status: 1, paymentStatus: 1, createdAt: 1 } },
      ],
    }),
    // Calls from the table's QR page not yet seen to.
    ...lookup({ from: GuestRequest, localField: '_id', foreignField: 'tableId', as: 'requests', pipeline: [{ $match: { ...scope, resolved: false } }, { $project: { _id: asId, type: 1, createdAt: 1 } }] }),
    // The next booking from 30 minutes ago to 90 minutes ahead.
    ...lookup({
      from: Reservation,
      localField: '_id',
      foreignField: 'tableId',
      as: 'booking',
      pipeline: [
        { $match: { ...scope, status: { $nin: ['cancelled', 'seated'] }, dateTime: { $gte: minTime, $lte: maxTime } } },
        { $sort: { dateTime: 1 } },
        { $limit: 1 },
        { $project: { _id: asId, dateTime: 1, partySize: 1 } },
      ],
    }),
    {
      $project: {
        name: 1,
        section: 1,
        seats: 1,
        qrCode: 1,
        oldCodes: 1,
        archived: 1,
        orders: { $cond: ['$archived', [], '$orders'] },
        requests: { $cond: ['$archived', [], '$requests'] },
        booking: { $cond: ['$archived', null, { $ifNull: [{ $first: '$booking' }, null] }] },
      },
    },
  ]);

  return c.json(floorTables);
}

export async function createTable(c: Context) {
  const body = c.get('validatedJson');
  const branchId = await resolveBranchId(c, body.branchId);

  const qrCode = tableCode(await restaurantName(c), body.name);
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

  const restaurant = await restaurantName(c);
  const toInsert: Array<Record<string, unknown>> = [];
  for (const name of body.names) {
    if (usedNames.has(name.toLowerCase())) continue;
    usedNames.add(name.toLowerCase());
    toInsert.push({ branchId, name, section: body.section, seats: body.seats ?? null, qrCode: tableCode(restaurant, name), archived: false });
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

  // A new code is for a card that went missing: the earlier ones stop opening the table.
  table.qrCode = tableCode(await restaurantName(c), table.name);
  table.oldCodes = undefined;
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
