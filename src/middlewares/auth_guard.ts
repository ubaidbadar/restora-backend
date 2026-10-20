import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import auth from '../config/auth';
import Branch from '../models/branch';
import Restaurant from '../models/restaurant';
import Role from '../models/role';
import StaffMember, { type IStaffMember } from '../models/staff_member';
import { type IDevice } from '../models/device';
import { runWithoutTenant } from './tenant_context';
import findDeviceByToken from '../utils/find_device';
import { buildMe, firstWorkableMembership, isOwnerMembership, openBranchesFor, saveWorkplace, workableMembership } from '../utils/workplace';

export interface AuthContextVariables {
  user?: { id: string; name: string; email: string; image?: string | null };
  session?: { token: string; userId: string; activeRestaurantId?: string | null; activeBranchId?: string | null };
  membership?: IStaffMember;
  device?: IDevice;
  restaurantId?: string;
  branchId?: string;
  isOwner?: boolean;
  via?: 'web' | 'pos';
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

/** Puts the member's restaurant, branch and owner status on the request. */
async function enterWorkplace(c: Context, member: IStaffMember, wantedBranchId: string | null | undefined) {
  const [branches, ownerRole] = await Promise.all([
    openBranchesFor(member),
    runWithoutTenant(() => Role.exists({ _id: { $in: member.roleIds }, restaurantId: member.restaurantId, key: 'owner' })),
  ]);
  const branch = branches.find((b) => String(b._id) === wantedBranchId) ?? branches[0];
  c.set('membership', member);
  c.set('restaurantId', String(member.restaurantId));
  c.set('isOwner', isOwnerMembership(member) || Boolean(ownerRole));
  if (branch) c.set('branchId', String(branch._id));
}

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

    const activeRestaurantId = (session.activeRestaurantId as string | null | undefined) || null;
    let member = activeRestaurantId ? await workableMembership(user.id, activeRestaurantId) : null;
    const lost = Boolean(activeRestaurantId && !member);

    if (!member) {
      // First request of this sign-in, or the restaurant was lost (removed, suspended, being deleted):
      // work in their first restaurant, if they have one.
      member = await firstWorkableMembership(user.id);
      if (member || lost) await saveWorkplace(session.token, member ? String(member.restaurantId) : null);
    }
    if (member) await enterWorkplace(c, member, lost ? null : (session.activeBranchId as string | null | undefined));

    if (lost && !accountLevel) {
      // The answer carries where they work now, so the app updates without asking again.
      return c.json({ code: 'context_lost', message: 'You no longer have access to that restaurant.', me: await buildMe(c) }, 403);
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

  const [branch, restaurant] = await runWithoutTenant(() =>
    Promise.all([Branch.findById(device.branchId).catch(() => null), Restaurant.findById(device.restaurantId)])
  );
  if (!branch || branch.isActive === false || restaurant?.status !== 'active') {
    return unauthorized(c, 'signed_out', 'This terminal is no longer in use. Register it again.');
  }
  if (!device.actor?.membershipId) {
    return unauthorized(c, 'pos_locked', 'Unlock the terminal with your PIN');
  }

  const lastActive = device.actor.lastActiveAt ? Date.parse(device.actor.lastActiveAt) : 0;
  const staff = await runWithoutTenant(() =>
    StaffMember.findOne({ _id: device.actor!.membershipId, restaurantId: device.restaurantId, status: 'active' })
  );
  const worksHere = staff && (isOwnerMembership(staff) || staff.branchScope === 'all' || staff.branchIds.includes(device.branchId));
  if (!staff || !worksHere || Date.now() - lastActive > actorIdleLimit(device)) {
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
  c.set('user', { id: staff.userId, name: device.actor.name, email: '' });
  await enterWorkplace(c, staff, device.branchId);
  await next();
}

export default authGuard;
