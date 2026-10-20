import type { Context } from 'hono';
import type { IDevice } from '../models/device';
import StaffMember, { type IStaffMember } from '../models/staff_member';
import Restaurant from '../models/restaurant';
import Branch from '../models/branch';
import Role from '../models/role';
import logAudit from '../utils/audit';
import { findAuthUser, findAuthUsers } from '../utils/auth_users';
import { runWithoutTenant } from '../middlewares/tenant_context';
import { buildMe } from '../utils/workplace';

const MAX_PIN_ATTEMPTS = 5;
const PAUSE_MS = 5 * 60 * 1000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DeviceDoc = IDevice & { _id: any; save: () => Promise<unknown> };

const worksAt = (member: IStaffMember, branchId: string) =>
  member.isOwner || member.isPrimaryOwner || member.branchScope === 'all' || member.branchIds.includes(branchId);

async function posState(device: DeviceDoc) {
  const restaurant = await runWithoutTenant(() => Restaurant.findById(device.restaurantId));
  const branch = await Branch.findById(device.branchId);
  return {
    device: { _id: String(device._id), name: device.name, settings: device.settings },
    restaurant: { name: restaurant?.name || 'Restaurant', logo: restaurant?.logo },
    branch: { _id: String(branch?._id || device.branchId), name: branch?.name || 'Main Branch' },
    actor: device.actor?.membershipId ? { name: device.actor.name, membershipId: device.actor.membershipId } : null,
    pausedUntil: device.pausedUntil || null,
  };
}

export async function getPosState(c: Context) {
  const device = c.get('device') as DeviceDoc;

  if (device.pausedUntil && Date.now() > Date.parse(device.pausedUntil)) {
    device.pausedUntil = null;
    device.consecutiveFailedPins = 0;
    await device.save();
  }

  return c.json(await posState(device));
}

export async function getPosPeople(c: Context) {
  const device = c.get('device') as DeviceDoc;

  // Scoped to the terminal's restaurant by posDeviceGuard; only people who work in its branch.
  const staff = (await StaffMember.find({ status: 'active' }).sort({ joinedAt: 1 })).filter((m) => worksAt(m, device.branchId));
  const [users, roles] = await Promise.all([
    findAuthUsers(staff.map((m) => m.userId)),
    Role.find({ _id: { $in: staff.flatMap((m) => m.roleIds) } }),
  ]);
  const roleName = new Map(roles.map((r) => [String(r._id), r.name]));

  return c.json(
    staff.map((m) => ({
      membershipId: String(m._id),
      name: users.get(m.userId)?.name || 'Staff',
      image: users.get(m.userId)?.image ?? null,
      roleNames: m.roleIds.map((id) => roleName.get(id)).filter(Boolean),
      locked: Boolean(m.pinLocked),
      hasPin: Boolean(m.pinHash),
    }))
  );
}

export async function unlockPos(c: Context) {
  const device = c.get('device') as DeviceDoc;

  if (device.pausedUntil) {
    if (Date.now() < Date.parse(device.pausedUntil)) {
      return c.json(
        { message: 'Terminal paused due to repeated failed PIN attempts. Please wait.', pausedUntil: device.pausedUntil },
        429
      );
    }
    device.pausedUntil = null;
    device.consecutiveFailedPins = 0;
  }

  const { membershipId, pin } = c.get('validatedJson') as { membershipId: string; pin: string };

  // Tenant-scoped: only members of this terminal's restaurant can be found.
  const member = await StaffMember.findOne({ _id: membershipId }).catch(() => null);
  if (!member || member.status !== 'active' || !worksAt(member, device.branchId)) {
    return c.json({ message: 'Staff member not found or inactive' }, 404);
  }

  if (member.pinLocked) {
    return c.json(
      { message: 'This PIN is locked due to too many failed attempts. A manager can unlock it in Team settings.' },
      403
    );
  }

  if (!member.pinHash) {
    return c.json({ message: 'PIN has not been set for this account yet.' }, 400);
  }

  if (!(await Bun.password.verify(pin, member.pinHash))) {
    member.failedPinAttempts = (member.failedPinAttempts || 0) + 1;
    if (member.failedPinAttempts >= MAX_PIN_ATTEMPTS) {
      member.pinLocked = true;
      await logAudit({
        action: 'pin.locked',
        actor: { via: 'system' },
        target: { type: 'membership', id: membershipId, label: 'Staff PIN locked' },
      });
    }
    await member.save();

    device.consecutiveFailedPins = (device.consecutiveFailedPins || 0) + 1;
    if (device.consecutiveFailedPins >= MAX_PIN_ATTEMPTS) {
      device.pausedUntil = new Date(Date.now() + PAUSE_MS).toISOString();
    }
    await device.save();

    return c.json(
      {
        message: 'Incorrect PIN',
        attemptsLeft: Math.max(0, MAX_PIN_ATTEMPTS - member.failedPinAttempts),
        pausedUntil: device.pausedUntil || null,
      },
      401
    );
  }

  member.failedPinAttempts = 0;
  await member.save();

  const actorName = (await findAuthUser(member.userId))?.name || 'Staff Member';
  device.consecutiveFailedPins = 0;
  device.pausedUntil = null;
  device.actor = { membershipId: String(member._id), name: actorName, lastActiveAt: new Date().toISOString() };
  await device.save();

  await logAudit({
    action: 'pos.unlocked',
    actor: { name: actorName, via: 'pos' },
    target: { type: 'device', id: String(device._id), label: device.name },
  });

  // The terminal now works as this person: the answer carries their /me.
  c.set('user', { id: member.userId, name: actorName, email: '' });
  c.set('membership', member);
  c.set('isOwner', Boolean(member.isOwner || member.isPrimaryOwner));
  c.set('via', 'pos');
  return c.json({ ...(await posState(device)), me: await buildMe(c) });
}

export async function lockPos(c: Context) {
  const device = c.get('device') as DeviceDoc;

  const prevActor = device.actor?.name;
  device.actor = null;
  await device.save();

  if (prevActor) {
    await logAudit({
      action: 'pos.locked',
      actor: { name: prevActor, via: 'pos' },
      target: { type: 'device', id: String(device._id), label: device.name },
    });
  }

  return c.json(await posState(device));
}

export default {
  getState: getPosState,
  getPeople: getPosPeople,
  unlock: unlockPos,
  lock: lockPos,
};
