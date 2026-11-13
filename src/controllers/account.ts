import type { Context } from 'hono';
import mongoose from 'mongoose';
import auth from '../config/auth';
import StaffMember, { type IStaffMember } from '../models/staff_member';
import PushDevice from '../models/push_device';
import Restaurant from '../models/restaurant';
import { runWithoutTenant } from '../middlewares/tenant_context';
import logAudit from '../utils/audit';
import validatePin from '../utils/validate_pin';
import { moveTo, toMe, type Workplace } from '../utils/workplace';

/** `GET /me`: the account, where it works now and what it may do there; the auth guard already loaded all of it. */
export async function getMe(c: Context) {
  return c.json(toMe(c.var));
}

/** Switch this sign-in to another restaurant the person works at. */
export async function switchWorkplace(c: Context) {
  const { restaurantId } = c.get('validatedJson') as { restaurantId: string };
  const me = await moveTo(c, restaurantId);
  if (!me) {
    return c.json({ message: 'You do not work at that restaurant, or it is closed' }, 403);
  }
  return c.json(me);
}

/** Save personal workspace layout preferences for this restaurant membership. */
export async function updatePreferences(c: Context) {
  const membership = c.get('membership') as IStaffMember | undefined;
  if (c.get('via') !== 'web' || !membership?._id) {
    return c.json({ message: 'Open a restaurant from your own account to save workspace preferences' }, 403);
  }

  const body = c.get('validatedJson') as {
    orders?: {
      sidebarHidden?: boolean;
      detailsPanel?: boolean;
      density?: 'comfortable' | 'compact';
    };
  };
  const updates: Record<string, boolean | string> = {};
  if (body.orders?.sidebarHidden !== undefined) updates['preferences.orders.sidebarHidden'] = body.orders.sidebarHidden;
  if (body.orders?.detailsPanel !== undefined) updates['preferences.orders.detailsPanel'] = body.orders.detailsPanel;
  if (body.orders?.density !== undefined) updates['preferences.orders.density'] = body.orders.density;

  const saved = Object.keys(updates).length
    ? await StaffMember.findOneAndUpdate(
        { _id: membership._id, userId: membership.userId, restaurantId: membership.restaurantId },
        { $set: updates },
        { new: true, runValidators: true },
      )
    : membership;
  if (!saved) return c.json({ message: 'Your restaurant membership could not be found' }, 404);

  const orders = saved.preferences?.orders ?? {};
  return c.json({
    preferences: {
      orders: {
        sidebarHidden: orders.sidebarHidden ?? false,
        detailsPanel: orders.detailsPanel ?? false,
        density: orders.density === 'compact' ? 'compact' : 'comfortable',
      },
    },
  });
}

export async function switchBranch(c: Context) {
  const { branchId } = c.get('validatedJson') as { branchId: string };
  const workplace = c.get('workplace') as Workplace | undefined;
  if (!workplace) {
    return c.json({ message: 'Open a restaurant first' }, 400);
  }
  if (!workplace.branches.some((b) => b._id === branchId)) {
    return c.json({ message: 'You do not work at that branch, or it is closed' }, 403);
  }
  return c.json(await moveTo(c, workplace.restaurant._id, branchId));
}

/** "Chrome on Android" from a user agent; good enough to tell sessions apart. */
function describeAgent(agent?: string | null): string {
  if (!agent) return 'Web browser';
  const browser = /Edg\//.test(agent) ? 'Edge' : /Chrome\//.test(agent) ? 'Chrome' : /Firefox\//.test(agent) ? 'Firefox' : /Safari\//.test(agent) ? 'Safari' : 'Browser';
  const os = /Android/.test(agent) ? 'Android' : /iPhone|iPad/.test(agent) ? 'iOS' : /Mac OS X/.test(agent) ? 'macOS' : /Windows/.test(agent) ? 'Windows' : /Linux/.test(agent) ? 'Linux' : '';
  return os ? `${browser} on ${os}` : browser;
}

const toIso = (value: unknown) => (value ? new Date(value as string).toISOString() : new Date().toISOString());

export async function listWebSessions(c: Context) {
  const currentToken = c.get('session')?.token;
  const sessions = await auth.api.listSessions({ headers: c.req.raw.headers });

  return c.json(
    sessions
      .sort((a, b) => Date.parse(String(b.updatedAt)) - Date.parse(String(a.updatedAt)))
      .map((s) => ({
        token: s.token,
        device: describeAgent(s.userAgent),
        createdAt: toIso(s.createdAt),
        updatedAt: toIso(s.updatedAt),
        current: s.token === currentToken,
      }))
  );
}

export async function revokeWebSession(c: Context) {
  const token = c.req.param('token');
  if (!token) {
    return c.json({ message: 'Token is required' }, 400);
  }
  // Better Auth only revokes a session that belongs to the signed-in user.
  await auth.api.revokeSession({ body: { token }, headers: c.req.raw.headers });
  return c.json({ success: true, message: 'Session revoked' });
}

export async function revokeOtherSessions(c: Context) {
  await auth.api.revokeOtherSessions({ headers: c.req.raw.headers });
  return c.json({ success: true, message: 'All other sessions revoked' });
}

export async function updateProfile(c: Context) {
  const user = c.get('user');
  const { name } = c.get('validatedJson') as { name: string };

  await auth.api.updateUser({ body: { name }, headers: c.req.raw.headers });
  return c.json({ id: user.id, name, email: user.email });
}

export async function setStaffPin(c: Context) {
  const user = c.get('user');
  const membership = c.get('membership');

  if (c.get('via') !== 'web' || !membership) {
    return c.json({ message: 'Set your PIN from your own account, in a restaurant you work at' }, 403);
  }

  const { pin } = c.get('validatedJson') as { pin: string };
  const check = validatePin(pin);
  if (!check.valid) {
    return c.json({ message: check.message || 'Invalid PIN' }, 400);
  }

  membership.pinHash = await Bun.password.hash(pin);
  membership.pinLocked = false;
  membership.failedPinAttempts = 0;
  await membership.save();

  await logAudit({
    action: 'pin.set',
    actor: { userId: user.id, name: user.name, via: 'web' },
    target: { type: 'membership', id: String(membership._id), label: user.name },
  });

  return c.json({ success: true });
}

export async function deleteAccount(c: Context) {
  const user = c.get('user');

  if (c.get('via') !== 'web') {
    return c.json({ message: 'Delete your account from the web application' }, 403);
  }

  // A primary owner cannot delete their account while owning active restaurants
  const activeOwnedRestaurants = await runWithoutTenant(async () => {
    const ownedMemberships = await StaffMember.find({ userId: user.id, isPrimaryOwner: true });
    if (!ownedMemberships.length) return [];
    const rids = ownedMemberships.map((m) => m.restaurantId).filter((id): id is string => Boolean(id));
    if (!rids.length) return [];
    return Restaurant.find({ _id: { $in: rids }, status: { $ne: 'deleting' } });
  });

  if (activeOwnedRestaurants.length > 0) {
    const names = activeOwnedRestaurants.map((r) => r.name).join(', ');
    return c.json(
      { message: `You are the owner of ${names}. Transfer ownership or delete the restaurant first.` },
      400
    );
  }

  await logAudit({
    action: 'account.deleted',
    actor: { userId: user.id, name: user.name, via: 'web' },
    target: { type: 'user', id: user.id, label: user.email },
  });

  // Remove memberships across all restaurants, and the phones and browsers that got their alerts
  await runWithoutTenant(() => Promise.all([StaffMember.deleteMany({ userId: user.id }), PushDevice.deleteMany({ userId: user.id })]));

  // Clean up user, sessions, and accounts from MongoDB
  const db = mongoose.connection.getClient().db();
  const userFilters: Record<string, unknown>[] = [{ _id: String(user.id) }];
  if (mongoose.Types.ObjectId.isValid(user.id)) {
    userFilters.push({ _id: new mongoose.Types.ObjectId(user.id) });
  }
  const userRefFilters: Record<string, unknown>[] = [{ userId: String(user.id) }];
  if (mongoose.Types.ObjectId.isValid(user.id)) {
    userRefFilters.push({ userId: new mongoose.Types.ObjectId(user.id) });
  }

  await Promise.all([
    db.collection<Record<string, unknown>>('user').deleteMany({ $or: userFilters }),
    db.collection<Record<string, unknown>>('session').deleteMany({ $or: userRefFilters }),
    db.collection<Record<string, unknown>>('account').deleteMany({ $or: userRefFilters }),
  ]);

  c.header('Set-Cookie', 'better-auth.session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax');

  return c.json({ success: true, message: 'Account deleted' });
}

export default {
  getMe,
  switchWorkplace,
  switchBranch,
  updatePreferences,
  listSessions: listWebSessions,
  revokeSession: revokeWebSession,
  revokeOtherSessions,
  updateProfile,
  setPin: setStaffPin,
  deleteAccount,
};
