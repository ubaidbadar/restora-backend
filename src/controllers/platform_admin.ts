import type { Context } from 'hono';
import mongoose from 'mongoose';
import Restaurant from '../models/restaurant';
import Order from '../models/order';
import Branch from '../models/branch';
import StaffMember from '../models/staff_member';
import Customer from '../models/customer';
import WhatsAppConnection from '../models/whatsapp_connection';
import PlatformAdmin from '../models/platform_admin';
import PlatformAuditEntry from '../models/platform_audit_entry';
import runInTransaction from '../utils/transaction';
import { findAuthUserByEmail, findAuthUsers, toObjectId } from '../utils/auth_users';
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
  const details = await findAuthUsers(users.map(u => u.userId));
  return c.json(users.map(u => ({ userId: u.userId, email: details.get(u.userId)?.email || '(account unavailable)', role: u.role, enabled: u.enabled, createdAt: u.createdAt })));
}

export async function upsertPlatformTeam(c: Context) {
  const actor = requirePlatformOwner(c);
  if (!actor) return c.json({ message: 'Owner access required' }, 403);
  const { email, role, enabled } = c.get('validatedJson') as { email: string; role: 'analyst' | 'support'; enabled: boolean };
  const target = await findAuthUserByEmail(email);
  if (!target) return c.json({ message: 'Team member must create and verify a Restora account first.' }, 404);
  const targetObjectId = toObjectId(target.id);
  if (!targetObjectId) return c.json({ message: 'The teammate account could not be verified.' }, 409);
  const verified = await mongoose.connection.db?.collection('user').findOne({ _id: targetObjectId, emailVerified: true }, { projection: { _id: 1 } });
  if (!verified) return c.json({ message: 'The teammate must verify their email before access can be granted.' }, 409);
  const userId = target.id;
  if (userId === actor.userId) return c.json({ message: 'Cannot change own platform role' }, 400);
  // A platform owner may grant only analyst/support roles; never create an owner via the API.
  const result = await runWithoutTenant(() => runInTransaction(async session => {
    const prior = await PlatformAdmin.findOne({ userId }, null, { session });
    const updated = await PlatformAdmin.findOneAndUpdate({ userId }, {
      $set: { role, enabled },
    }, { upsert: true, returnDocument: 'after', runValidators: true, session });
    await PlatformAuditEntry.create([{
      action: 'platform.team_access_changed',
      actorUserId: actor.userId, targetUserId: userId,
      before: prior ? { role: prior.role, enabled: prior.enabled } : undefined,
      after: { role, enabled }, at: new Date(),
    }], { session });
    return updated;
  }));
  console.info('[Platform Audit] team access changed', { actor: actor.userId, target: userId });
  return c.json({ userId: result!.userId, email: target.email, role: result!.role, enabled: result!.enabled });
}

/** Platform privilege history is only visible to owners; no restaurant data is copied here. */
export async function platformActivity(c: Context) {
  if (!requirePlatformOwner(c)) return c.json({ message: 'Owner access required' }, 403);
  const entries = await runWithoutTenant(() => PlatformAuditEntry.find().sort({ at: -1 }).limit(100).lean());
  const ids = entries.flatMap(e => [e.actorUserId, e.targetUserId]);
  const users = await findAuthUsers(ids);
  return c.json(entries.map(e => ({
    id: String(e._id), action: e.action, at: e.at,
    actor: users.get(e.actorUserId)?.email || 'Unknown account',
    target: users.get(e.targetUserId)?.email || 'Unknown account',
    before: e.before, after: e.after,
  })), 200, { 'Cache-Control': 'no-store' });
}

export function platformHealth(c: Context) {
  const whatsappConfigured = Boolean(process.env.WHATSAPP_META_APP_ID && process.env.WHATSAPP_META_APP_SECRET &&
    process.env.WHATSAPP_META_CONFIG_ID && process.env.WHATSAPP_APP_SECRET &&
    /^[a-f0-9]{64}$/i.test(process.env.WHATSAPP_TOKEN_ENCRYPTION_KEY || ''));
  return c.json({
    database: mongoose.connection.readyState === 1 ? 'connected' : 'unavailable',
    whatsappSignup: whatsappConfigured ? 'configured' : 'configuration_required',
    checkedAt: new Date().toISOString(),
  }, 200, { 'Cache-Control': 'no-store' });
}
