import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import auth from '../config/auth';
import type Permission from '@shared/permission';
import type Me from '@shared/me';
import { type IStaffMember } from '../models/staff_member';
import { type IDevice } from '../models/device';
import { runWithoutTenant } from './tenant_context';
import findDeviceByToken, { terminalInUse } from '../utils/find_device';
import { toObjectId } from '../utils/auth_users';
import { enterWorkplace, loadWorkplace, sessionWorkplace, toMe, type Workplace } from '../utils/workplace';

export interface AuthContextVariables {
  user?: { id: string; name: string; email: string; image?: string | null };
  session?: { token: string; userId: string; activeRestaurantId?: string | null; activeBranchId?: string | null };
  membership?: IStaffMember;
  device?: IDevice;
  restaurantId?: string;
  branchId?: string;
  isOwner?: boolean;
  via?: 'web' | 'pos';
  /** Where they work, loaded once per request by this guard (utils/workplace). */
  workplace?: Workplace;
  /** Their open restaurants, for the switcher. */
  restaurants?: Me['restaurants'];
  permissions?: { all: boolean; set: Set<Permission> | Set<string> };
}

/** Routes that check their own credentials (POS terminals) or need none. */
const SELF_AUTHENTICATED = [/^\/api\/v1\/pos(\/|$)/, /^\/api\/v1\/invitations\/lookup\//];

/** Account-level routes: they work without a restaurant, so a lost restaurant must not block them. */
const ACCOUNT_LEVEL = [
  /^\/api\/v1\/me(\/|$)/,
  /^\/api\/v1\/restaurants(\/|$)/,
  /^\/api\/v1\/onboarding$/,
  /^\/api\/v1\/my-invitations(\/|$)/,
  /^\/api\/v1\/invitations\/accept\//,
];

/** A POS actor stays signed in this long without a request (at least a minute, whatever the terminal says). */
const actorIdleLimit = (device: IDevice) => Math.max(60, device.settings?.idleLockSeconds ?? 90) * 1000;

const unauthorized = (c: Context, code: 'signed_out' | 'pos_locked', message: string) => c.json({ code, message }, 401);

export async function authGuard(c: Context, next: Next) {
  const path = c.req.path;
  if (SELF_AUTHENTICATED.some((pattern) => pattern.test(path))) {
    await next();
    return;
  }
  const accountLevel = ACCOUNT_LEVEL.some((pattern) => pattern.test(path));

  // 1. Someone's own sign-in (Better Auth cookie). The restaurant and branch come from the session, never from the request.
  const signedIn = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  if (signedIn?.user) {
    const { user, session } = signedIn;
    c.set('user', { id: user.id, name: user.name, email: user.email, image: user.image });
    c.set('session', session);
    c.set('via', 'web');

    // One aggregation: where they work (the restaurant saved on the session, while they still work there), what they
    // may do there, and their other restaurants. /me is then made from it without asking the database again.
    const found = await sessionWorkplace(user.id, session);
    enterWorkplace(c, found);
    const lost = Boolean(session.activeRestaurantId && found.workplace?.restaurant._id !== session.activeRestaurantId);

    if (lost && !accountLevel) {
      // The answer carries where they work now, so the app updates without asking again.
      return c.json({ code: 'context_lost', message: 'You no longer have access to that restaurant.', me: toMe(c.var) }, 403);
    }

    await next();
    return;
  }

  // 2. A registered POS terminal with someone unlocked on it.
  const deviceToken = getCookie(c, 'pos_device_token') || c.req.header('x-device-token');
  const device = deviceToken ? await findDeviceByToken(deviceToken) : null;
  if (!device) {
    return unauthorized(c, 'signed_out', 'Sign in to continue');
  }

  if (!device.actor?.membershipId) {
    // Nobody unlocked: still say so only for a terminal that is in use.
    if (!(await terminalInUse(device))) return unauthorized(c, 'signed_out', 'This terminal is no longer in use. Register it again.');
    return unauthorized(c, 'pos_locked', 'Unlock the terminal with your PIN');
  }

  // One aggregation: the unlocked person in the terminal's restaurant, with its roles, open branches and settings.
  const restaurantId = String(device.restaurantId);
  const found = await loadWorkplace({ _id: toObjectId(device.actor.membershipId), restaurantId, status: 'active' }, restaurantId, device.branchId, true);
  const { workplace } = found;
  // A closed restaurant has no workplace; an archived branch is not among the open ones.
  if (!workplace || !workplace.openBranches.some((b) => b._id === device.branchId)) {
    if (!(await terminalInUse(device))) return unauthorized(c, 'signed_out', 'This terminal is no longer in use. Register it again.');
  }
  const lastActive = device.actor.lastActiveAt ? Date.parse(device.actor.lastActiveAt) : 0;
  if (!workplace?.branch || Date.now() - lastActive > actorIdleLimit(device)) {
    device.actor = null;
    await runWithoutTenant(() => device.save());
    return unauthorized(c, 'pos_locked', 'The terminal locked itself. Unlock it with your PIN.');
  }

  // Keep the actor alive; write at most every 15 seconds.
  if (Date.now() - lastActive > 15_000) {
    device.actor.lastActiveAt = new Date().toISOString();
    await runWithoutTenant(() => device.save());
  }

  c.set('device', device);
  c.set('via', 'pos');
  c.set('user', { id: workplace.member.userId, name: device.actor.name, email: '' });
  enterWorkplace(c, found);
  await next();
}

export default authGuard;
