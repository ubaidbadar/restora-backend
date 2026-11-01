import type { Context } from 'hono';
import Reservation from '../models/reservation';
import Customer from '../models/customer';
import Table from '../models/table';
import logAudit, { auditActor } from '../utils/audit';
import httpError from '../utils/http_error';
import resolveBranchId from '../utils/resolve_branch';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

async function checkTable(tableId: string | null | undefined, branchId: string) {
  if (!tableId) return;
  const table = await Table.exists({ _id: tableId, branchId, archived: false }).catch(() => null);
  if (!table) throw httpError(400, 'That table is not in this branch');
}

export async function listReservations(c: Context) {
  const branchId = c.get('branchId') as string | undefined;
  const date = c.req.query('date');

  const filter: Record<string, unknown> = {};
  if (branchId) filter.branchId = branchId;
  if (date) {
    if (!DAY.test(date)) return c.json({ message: 'Use a date like 2026-01-31' }, 400);
    // Bookings are stored in UTC; a Pakistan calendar day runs from 19:00 UTC the day before.
    const start = new Date(`${date}T00:00:00.000+05:00`);
    const end = new Date(start.getTime() + 86_400_000);
    filter.dateTime = { $gte: start.toISOString(), $lt: end.toISOString() };
  }

  const reservations = await Reservation.find(filter).sort({ dateTime: 1 }).limit(1000);
  return c.json(reservations);
}

export async function getReservation(c: Context) {
  const reservation = await Reservation.findById(c.req.param('id')).catch(() => null);
  if (!reservation) {
    return c.json({ message: 'Reservation not found' }, 404);
  }
  return c.json(reservation);
}

export async function createReservation(c: Context) {
  const body = c.get('validatedJson');
  const branchId = await resolveBranchId(c, body.branchId);
  await checkTable(body.tableId, branchId);

  const cust = body.customerId
    ? await Customer.findById(body.customerId).catch(() => null)
    : ((await Customer.findOne({ phone: body.guestPhone })) ??
      (await Customer.create({ name: body.guestName, phone: body.guestPhone, source: 'staff' })));
  if (!cust) {
    return c.json({ message: 'That customer was not found' }, 400);
  }

  const reservation = await Reservation.create({
    branchId,
    customerId: String(cust._id),
    customer: { _id: String(cust._id), name: cust.name, phone: cust.phone },
    partySize: body.partySize,
    dateTime: new Date(body.dateTime).toISOString(),
    status: body.status,
    tableId: body.tableId || undefined,
    note: body.note || undefined,
  });

  await logAudit({
    action: 'reservation.created',
    actor: auditActor(c),
    target: { type: 'reservation', id: String(reservation._id), label: `Party of ${reservation.partySize}` },
  });

  return c.json(reservation, 201);
}

export async function updateReservation(c: Context) {
  const id = c.req.param('id') ?? '';
  const body = { ...(c.get('validatedJson') as Record<string, unknown>) };

  const existing = await Reservation.findById(id).catch(() => null);
  if (!existing) {
    return c.json({ message: 'Reservation not found' }, 404);
  }
  if ('tableId' in body) await checkTable(body.tableId as string | null, existing.branchId);
  if (body.dateTime) body.dateTime = new Date(body.dateTime as string).toISOString();

  const update: Record<string, unknown> = { $set: body };
  if (body.tableId === null) {
    delete body.tableId;
    update.$unset = { tableId: 1 };
  }
  const reservation = await Reservation.findByIdAndUpdate(id, update, { returnDocument: 'after' });

  await logAudit({
    action: 'reservation.updated',
    actor: auditActor(c),
    target: { type: 'reservation', id, label: `Status: ${reservation?.status}` },
  });

  return c.json(reservation);
}

export async function deleteReservation(c: Context) {
  const id = c.req.param('id') ?? '';
  const reservation = await Reservation.findByIdAndDelete(id).catch(() => null);
  if (!reservation) {
    return c.json({ message: 'Reservation not found' }, 404);
  }

  await logAudit({ action: 'reservation.deleted', actor: auditActor(c), target: { type: 'reservation', id } });
  return c.json({ success: true, message: 'Reservation deleted' });
}

export default {
  list: listReservations,
  get: getReservation,
  create: createReservation,
  update: updateReservation,
  delete: deleteReservation,
};
