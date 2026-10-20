import type { Context } from 'hono';
import PRESET_ROLES from '@shared/preset_roles';
import Restaurant from '../models/restaurant';
import StaffMember, { type IStaffMember } from '../models/staff_member';
import Branch from '../models/branch';
import Role from '../models/role';
import Settings from '../models/settings';
import logAudit from '../utils/audit';
import { buildMe, firstWorkableMembership, moveTo, saveWorkplace } from '../utils/workplace';
import { runWithoutTenant, runWithTenant } from '../middlewares/tenant_context';

const DELETE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/** After leaving or deleting: move this sign-in to another restaurant they work at, or to none. */
async function moveOn(c: Context) {
  const next = await firstWorkableMembership(c.get('user').id);
  if (next) return moveTo(c, next);
  await saveWorkplace(c.get('session').token, null);
  c.set('membership', undefined);
  c.set('restaurantId', undefined);
  c.set('branchId', undefined);
  return buildMe(c);
}

/** Every restaurant the person belongs to, with its state, for /restaurants. */
export async function listRestaurants(c: Context) {
  const user = c.get('user');
  const list = await runWithoutTenant(async () => {
    const memberships = await StaffMember.find({ userId: user.id }).sort({ joinedAt: 1 });
    return Promise.all(
      memberships.map(async (m) => {
        const [restaurant, roles] = await Promise.all([
          Restaurant.findById(m.restaurantId),
          Role.find({ _id: { $in: m.roleIds }, restaurantId: m.restaurantId }),
        ]);
        return restaurant
          ? {
              _id: String(m._id),
              status: m.status,
              roleNames: roles.map((r) => r.name),
              isPrimaryOwner: Boolean(m.isPrimaryOwner),
              restaurant: { _id: String(restaurant._id), name: restaurant.name, status: restaurant.status ?? 'active', deleteAfter: restaurant.deleteAfter },
            }
          : null;
      })
    );
  });
  return c.json(list.filter(Boolean));
}

/** First-run step 1: the restaurant, its first branch, the preset roles, the owner and default settings. */
export async function onboarding(c: Context) {
  const user = c.get('user');
  const { name, branchName, area, city, phone } = c.get('validatedJson') as {
    name: string;
    branchName: string;
    area?: string | null;
    city?: string | null;
    phone?: string | null;
  };

  const restaurant = await runWithoutTenant(() => Restaurant.create({ name, status: 'active' }));
  const restaurantId = String(restaurant._id);

  const { branch, owner } = await runWithTenant(restaurantId, async () => {
    const branch = await Branch.create({ name: branchName, area: area || undefined, city: city || undefined, phone: phone || undefined, isActive: true });
    const roles = await Role.insertMany(PRESET_ROLES.map((preset) => ({ restaurantId, key: preset.key, name: preset.name, isPreset: true, permissions: preset.permissions })));
    const ownerRole = roles.find((role) => role.key === 'owner')!;
    const owner = await StaffMember.create({
      userId: user.id,
      roleIds: [String(ownerRole._id)],
      branchScope: 'all',
      branchIds: [],
      status: 'active',
      isOwner: true,
      isPrimaryOwner: true,
    });
    await Settings.create({ restaurantName: name, onboarded: true, taxSet: false });
    return { branch, owner };
  });

  await logAudit({
    restaurantId,
    action: 'restaurant.onboarded',
    actor: { name: user.name, via: 'web' },
    target: { type: 'restaurant', id: restaurantId, label: name },
  });

  // This sign-in now works in the new restaurant.
  const me = await moveTo(c, owner, String(branch._id));
  return c.json({ restaurantId, name, restaurant: { _id: restaurantId, name }, branch: { _id: String(branch._id), name: branch.name }, me }, 201);
}

export async function transferOwnership(c: Context) {
  const user = c.get('user');
  const membership = c.get('membership') as (IStaffMember & { save: () => Promise<unknown> }) | undefined;

  if (!membership?.isPrimaryOwner) {
    return c.json({ message: 'Only the owner of the restaurant can transfer it' }, 403);
  }

  const { membershipId, confirmName, keepMeAsOwner = true } = c.get('validatedJson') as {
    membershipId: string;
    confirmName: string;
    keepMeAsOwner?: boolean;
  };

  const restaurant = await runWithoutTenant(() => Restaurant.findById(membership.restaurantId));
  if (!restaurant || restaurant.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) {
    return c.json({ message: 'Restaurant name confirmation does not match' }, 400);
  }

  const targetMember = await StaffMember.findById(membershipId).catch(() => null);
  if (!targetMember || targetMember.status !== 'active') {
    return c.json({ message: 'Pick an active member of this restaurant' }, 404);
  }
  if (String(targetMember._id) === String(membership._id)) {
    return c.json({ message: 'You already own this restaurant' }, 400);
  }

  const [ownerRole, managerRole] = await Promise.all([Role.findOne({ key: 'owner' }), Role.findOne({ key: 'manager' })]);
  if (!ownerRole) {
    return c.json({ message: 'This restaurant has no Owner role' }, 500);
  }
  const ownerRoleId = String(ownerRole._id);

  targetMember.isPrimaryOwner = true;
  targetMember.isOwner = true;
  targetMember.branchScope = 'all';
  targetMember.branchIds = [];
  if (!targetMember.roleIds.includes(ownerRoleId)) targetMember.roleIds = [ownerRoleId, ...targetMember.roleIds];
  await targetMember.save();

  membership.isPrimaryOwner = false;
  membership.isOwner = keepMeAsOwner;
  if (!keepMeAsOwner) {
    // Stepping down removes the Owner role too; otherwise the role would keep every permission.
    const rest = membership.roleIds.filter((id) => id !== ownerRoleId);
    membership.roleIds = rest.length ? rest : managerRole ? [String(managerRole._id)] : [];
  }
  await membership.save();

  await logAudit({
    action: 'restaurant.ownership_transferred',
    actor: { name: user.name, via: 'web' },
    target: { type: 'membership', id: membershipId, label: 'Transferred ownership' },
  });

  return c.json({ success: true, message: 'Ownership transferred', me: await buildMe(c) });
}

/** Schedules the restaurant for deletion in 30 days. Nobody can work in it meanwhile; the owner can keep it. */
export async function deleteRestaurant(c: Context) {
  const user = c.get('user');
  const membership = c.get('membership') as IStaffMember | undefined;

  if (!membership?.isPrimaryOwner) {
    return c.json({ message: 'Only the owner of the restaurant can delete it' }, 403);
  }

  const { confirmName } = c.get('validatedJson') as { confirmName: string };
  const restaurant = await runWithoutTenant(() => Restaurant.findById(membership.restaurantId));
  if (!restaurant || restaurant.name.trim().toLowerCase() !== confirmName.trim().toLowerCase()) {
    return c.json({ message: 'Restaurant name confirmation does not match' }, 400);
  }

  const deleteAfter = new Date(Date.now() + DELETE_GRACE_MS).toISOString();
  restaurant.status = 'deleting';
  restaurant.deleteAfter = deleteAfter;
  await restaurant.save();

  await logAudit({
    action: 'restaurant.scheduled_deletion',
    actor: { name: user.name, via: 'web' },
    target: { type: 'restaurant', id: String(restaurant._id), label: restaurant.name },
  });

  return c.json({ success: true, message: 'Restaurant scheduled for deletion in 30 days', deleteAfter, me: await moveOn(c) });
}

/** "Keep it": stops a scheduled deletion during the 30 days. Only the restaurant's owner, from /restaurants. */
export async function keepRestaurant(c: Context) {
  const user = c.get('user');
  const restaurantId = c.req.param('id') ?? '';

  const owner = await runWithoutTenant(() =>
    StaffMember.findOne({ restaurantId, userId: user.id, isPrimaryOwner: true, status: 'active' })
  );
  if (!owner) {
    return c.json({ message: 'Only the owner of the restaurant can keep it' }, 403);
  }

  const restaurant = await runWithoutTenant(() =>
    Restaurant.findOneAndUpdate(
      { _id: restaurantId, status: 'deleting' },
      { $set: { status: 'active' }, $unset: { deleteAfter: 1 } },
      { returnDocument: 'after' }
    )
  );
  if (!restaurant) {
    return c.json({ message: 'This restaurant is not scheduled for deletion' }, 400);
  }

  await logAudit({
    restaurantId,
    action: 'restaurant.deletion_cancelled',
    actor: { name: user.name, via: 'web' },
    target: { type: 'restaurant', id: restaurantId, label: restaurant.name },
  });

  return c.json({ success: true, message: 'Restaurant will not be deleted', restaurant: { _id: restaurantId, name: restaurant.name, status: 'active' } });
}

export async function leaveRestaurant(c: Context) {
  const user = c.get('user');
  const membership = c.get('membership') as IStaffMember | undefined;

  if (!membership) {
    return c.json({ message: 'Open the restaurant you want to leave first' }, 400);
  }
  if (membership.isPrimaryOwner) {
    return c.json({ message: 'The owner cannot leave. Transfer ownership first.' }, 400);
  }

  await StaffMember.deleteOne({ _id: membership._id });

  await logAudit({
    action: 'membership.left',
    actor: { name: user.name, via: 'web' },
    target: { type: 'membership', id: String(membership._id), label: user.name },
  });

  return c.json({ success: true, message: 'You left the restaurant', me: await moveOn(c) });
}

export default {
  list: listRestaurants,
  onboarding,
  transferOwnership,
  deleteRestaurant,
  keepRestaurant,
  leaveRestaurant,
};
