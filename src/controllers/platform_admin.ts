import type { Context } from 'hono';
import mongoose from 'mongoose';
import Restaurant from '../models/restaurant';
import Order from '../models/order';
import Branch from '../models/branch';
import StaffMember from '../models/staff_member';
import Customer from '../models/customer';
import WhatsAppConnection from '../models/whatsapp_connection';
import PlatformAdmin from '../models/platform_admin';
import { runWithoutTenant, runWithTenant } from '../middlewares/tenant_context';
import { requirePlatformOwner, type PlatformAdminIdentity } from '../middlewares/platform_admin_guard';

const parsePage = (value: string | undefined) => Math.max(1, Math.min(10000, Number(value) || 1));
const safeId = (id: string) => mongoose.isValidObjectId(id);
const pageSize = 30;

export function adminMe(c: Context) {
  const { userId, email, role } = c.get('platformAdmin') as PlatformAdminIdentity;
  return c.json({ id: userId, email, role });
}

/** Aggregated platform overview only. Not customer PII and no token material. */
export async function overview(c: Context) {
  const data = await runWithoutTenant(async () => {
    const [restaurants, branches, orders, customers, waConnected, latest] = await Promise.all([
      Restaurant.countDocuments({ status: { $ne: 'deleting' } }),
      Branch.countDocuments({ isActive: { $ne: false } }),
      Order.countDocuments(),
      Customer.countDocuments(),
      WhatsAppConnection.countDocuments({ status: 'connected' }),
      Restaurant.find().sort({ createdAt: -1 }).limit(6).select('name status createdAt').lean(),
    ]);
    return { restaurants, branches, orders, customers, waConnected,
      latestRestaurants: latest.map(r => ({ id: String(r._id), name: r.name, status: r.status, createdAt: r.createdAt })) };
  });
  return c.json(data, 200, { 'Cache-Control': 'no-store' });
}

export async function listRestaurants(c: Context) {
  const page = parsePage(c.req.query('page'));
  const q = (c.req.query('q') || '').trim().slice(0, 80);
  const filter = q ? { name: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } } : {};
  const result = await runWithoutTenant(async () => {
    const [list, count] = await Promise.all([
      Restaurant.find(filter).select('name status createdAt updatedAt').sort({ createdAt: -1 })
        .skip((page - 1) * pageSize).limit(pageSize).lean(),
      Restaurant.countDocuments(filter),
    ]);
    return { rows: list.map(r => ({ id: String(r._id), name: r.name, status: r.status || 'active', createdAt: r.createdAt, updatedAt: r.updatedAt })), count, page, pageSize };
  });
  return c.json(result, 200, { 'Cache-Control': 'no-store' });
}

export async function restaurantDetails(c: Context) {
  const id = c.req.param('id') || '';
  if (!safeId(id)) return c.json({ message: 'Invalid restaurant ID' }, 400);
  const restaurant = await runWithoutTenant(() => Restaurant.findById(id).select('name status createdAt updatedAt').lean());
  if (!restaurant) return c.json({ message: 'Restaurant not found' }, 404);
  const data = await runWithTenant(id, async () => {
    const [branches, staffCount, orderCount, customerCount, connections, recentOrders] = await Promise.all([
      Branch.find().select('name isActive city').sort({ name: 1 }).lean(),
      StaffMember.countDocuments(),
      Order.countDocuments(),
      Customer.countDocuments(),
      WhatsAppConnection.find().select('branchId phoneNumberDisplay status connectedAt invoiceOnComplete').lean(),
      Order.find().select('dailyToken branchId type status paymentStatus total createdAt').sort({ createdAt: -1 }).limit(25).lean(),
    ]);
    return {
      branches: branches.map(b => ({ id: String(b._id), name: b.name, city: b.city, isActive: b.isActive !== false })),
      staffCount, orderCount, customerCount,
      connections: connections.map(w => ({ id: String(w._id), branchId: w.branchId, number: w.phoneNumberDisplay, status: w.status, connectedAt: w.connectedAt, invoiceOnComplete: w.invoiceOnComplete })),
      recentOrders: recentOrders.map(o => ({ id: String(o._id), dailyToken: o.dailyToken, branchId: o.branchId, type: o.type, status: o.status, paymentStatus: o.paymentStatus, total: o.total, createdAt: o.createdAt })),
    };
  });
  return c.json({ restaurant: { id: String(restaurant._id), name: restaurant.name, status: restaurant.status, createdAt: restaurant.createdAt }, ...data }, 200, { 'Cache-Control': 'no-store' });
}

export async function listPlatformTeam(c: Context) {
  if (!requirePlatformOwner(c)) return c.json({ message: 'Owner access required' }, 403);
  const users = await runWithoutTenant(() => PlatformAdmin.find().select('userId role enabled createdAt').lean());
  return c.json(users.map(u => ({ userId: u.userId, role: u.role, enabled: u.enabled, createdAt: u.createdAt })));
}

export async function upsertPlatformTeam(c: Context) {
  const actor = requirePlatformOwner(c);
  if (!actor) return c.json({ message: 'Owner access required' }, 403);
  const { userId, role, enabled } = c.get('validatedJson') as { userId: string; role: 'analyst' | 'support'; enabled: boolean };
  if (userId === actor.userId) return c.json({ message: 'Cannot change own platform role' }, 400);
  // A platform owner may grant only analyst/support roles; never create an owner via the API.
  const result = await runWithoutTenant(() => PlatformAdmin.findOneAndUpdate({ userId }, {
    $set: { role, enabled },
  }, { upsert: true, returnDocument: 'after', runValidators: true }));
  console.info('[Platform Audit] team access changed', { actor: actor.userId, target: userId, role, enabled });
  return c.json({ userId: result!.userId, role: result!.role, enabled: result!.enabled });
}
