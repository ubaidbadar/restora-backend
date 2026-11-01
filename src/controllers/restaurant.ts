import type { Context } from 'hono';
import PRESET_ROLES from '@shared/preset_roles';
import Restaurant from '../models/restaurant';
import StaffMember, { type IStaffMember } from '../models/staff_member';
import Branch from '../models/branch';
import Role from '../models/role';
import Settings from '../models/settings';
import { uploadDataUrlToCloudflare } from '../services/cloudflare_storage';
import httpError from '../utils/http_error';
import logAudit from '../utils/audit';
import { moveTo } from '../utils/workplace';
import lookup from '../utils/lookup';
import { runWithoutTenant, runWithTenant } from '../middlewares/tenant_context';

const DELETE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/** After leaving or deleting: move this sign-in to another restaurant they work at, or to none. */
/** Into their oldest open restaurant, or none. */
const moveOn = (c: Context) => moveTo(c);

/**
 * Every restaurant the person belongs to, with its state and their roles there. One aggregation. The apps now read
 * `/me`'s `restaurants`; old app versions still call this, so it stays until they have updated.
 */
export async function listRestaurants(c: Context) {
  const list = await runWithoutTenant(() =>
    StaffMember.aggregate([
      { $match: { userId: c.get('user').id } },
      { $sort: { joinedAt: 1 } },
      ...lookup({ from: Restaurant, localField: 'restaurantId', as: 'restaurant', pipeline: [{ $project: { name: 1, status: 1, deleteAfter: 1 } }] }),
      { $unwind: '$restaurant' },
      ...lookup({ from: Role, localField: 'roleIds', as: 'roles', let: { rid: '$restaurantId' }, pipeline: [{ $match: { $expr: { $eq: ['$restaurantId', '$$rid'] } } }, { $project: { name: 1 } }] }),
      {
        $project: {
          _id: { $toString: '$_id' },
          status: 1,
          roleNames: '$roles.name',
          isPrimaryOwner: { $eq: ['$isPrimaryOwner', true] },
          restaurant: { _id: { $toString: '$restaurant._id' }, name: '$restaurant.name', status: { $ifNull: ['$restaurant.status', 'active'] }, deleteAfter: '$restaurant.deleteAfter' },
        },
      },
    ])
  );
  return c.json(list);
}

/** First-run step 1: the restaurant and its logo, its first branch, the preset roles, the owner and default settings. */
export async function onboarding(c: Context) {
  const user = c.get('user');
  const { name, branchName, area, city, phone, logo: logoDataUrl } = c.get('validatedJson') as {
    name: string;
    branchName: string;
    area?: string | null;
    city?: string | null;
    phone?: string | null;
    logo?: string | null;
  };

  // The logo is uploaded under the new restaurant's folder before anything is saved, so a bad image leaves no half-made restaurant.
  const restaurantId = String(new Restaurant()._id);
  const uploaded = logoDataUrl ? await uploadDataUrlToCloudflare(logoDataUrl, `r_${restaurantId}/logos`) : undefined;
  if (uploaded === null) throw httpError(400, 'Use a JPEG, PNG, WebP or GIF image of up to 5 MB');
  const logo = uploaded?.url;

  await runWithoutTenant(() => Restaurant.create({ _id: restaurantId, name, logo, status: 'active' }));

  const { branch } = await runWithTenant(restaurantId, async () => {
    const branch = await Branch.create({ name: branchName, area: area || undefined, city: city || undefined, phone: phone || undefined, isActive: true });
    const roles = await Role.insertMany(PRESET_ROLES.map((preset) => ({ restaurantId, key: preset.key, name: preset.name, isPreset: true, permissions: preset.permissions })));
    const ownerRole = roles.find((role) => role.key === 'owner')!;
    await StaffMember.create({
      userId: user.id,
      roleIds: [String(ownerRole._id)],
      branchScope: 'all',
      branchIds: [],
      status: 'active',
      isOwner: true,
      isPrimaryOwner: true,
    });
    await Settings.create({ restaurantName: name, logo, onboarded: true, taxSet: false });
    return { branch };
  });

  await logAudit({
    restaurantId,
    action: 'restaurant.onboarded',
    actor: { userId: user.id, name: user.name, via: 'web' },
    target: { type: 'restaurant', id: restaurantId, label: name },
  });

  // This sign-in now works in the new restaurant.
  const me = await moveTo(c, restaurantId, String(branch._id));
  return c.json({ restaurantId, name, restaurant: { _id: restaurantId, name, logo }, branch: { _id: String(branch._id), name: branch.name }, me }, 201);
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

  const presets = await Role.find({ key: { $in: ['owner', 'manager'] } });
  const ownerRole = presets.find((role) => role.key === 'owner');
  const managerRole = presets.find((role) => role.key === 'manager');
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
    actor: { userId: user.id, name: user.name, via: 'web' },
    target: { type: 'membership', id: membershipId, label: 'Transferred ownership' },
  });

  // They are no longer the owner: load it again, so /me shows what they may do now.
  return c.json({ success: true, message: 'Ownership transferred', me: await moveTo(c, String(membership.restaurantId), c.get('branchId')) });
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
    actor: { userId: user.id, name: user.name, via: 'web' },
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
    actor: { userId: user.id, name: user.name, via: 'web' },
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
    actor: { userId: user.id, name: user.name, via: 'web' },
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
