import type { Context } from 'hono';
import auth from '../config/auth';
import logAudit from '../utils/audit';
import validatePin from '../utils/validate_pin';
import { meOf, moveTo, type Workplace } from '../utils/workplace';

/** `GET /me`: the account, where it works now and what it may do there; the auth guard already loaded all of it. */
export async function getMe(c: Context) {
  return c.json(meOf(c));
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

/** Switch this sign-in to another branch of the current restaurant. */
export async function switchBranch(c: Context) {
  const { branchId } = c.get('validatedJson') as { branchId: string };
  const workplace = c.get('workplace') as Workplace | undefined;
  if (!workplace) {
    return c.json({ message: 'Open a restaurant first' }, 400);
  }
  if (!workplace.branches.some((b) => String(b._id) === branchId)) {
    return c.json({ message: 'You do not work at that branch, or it is closed' }, 403);
  }
  return c.json(await moveTo(c, String(workplace.member.restaurantId), branchId));
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
    actor: { name: user.name, via: 'web' },
    target: { type: 'membership', id: String(membership._id), label: user.name },
  });

  return c.json({ success: true });
}

export default {
  getMe,
  switchWorkplace,
  switchBranch,
  listSessions: listWebSessions,
  revokeSession: revokeWebSession,
  revokeOtherSessions,
  updateProfile,
  setPin: setStaffPin,
};
