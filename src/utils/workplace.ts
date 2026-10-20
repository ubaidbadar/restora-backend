import type { Context } from 'hono';
import auth from '../config/auth';
import PERMISSION_CATALOG from '@shared/permission_catalog';
import type Permission from '@shared/permission';
import type Me from '@shared/me';
import type RestaurantSettings from '@shared/restaurant_settings';
import Branch from '../models/branch';
import Restaurant from '../models/restaurant';
import Role from '../models/role';
import Settings from '../models/settings';
import StaffMember, { type IStaffMember } from '../models/staff_member';
import type { IDevice } from '../models/device';
import { runWithoutTenant } from '../middlewares/tenant_context';

const ALL_PERMISSIONS = PERMISSION_CATALOG.map((entry) => entry.permission) as Permission[];

/** Saves on the sign-in session where it works. Only the server writes these fields. */
export async function saveWorkplace(sessionToken: string, restaurantId: string | null, branchId: string | null = null) {
  const context = await auth.$context;
  await context.internalAdapter.updateSession(sessionToken, {
    activeRestaurantId: restaurantId,
    activeBranchId: branchId,
    updatedAt: new Date(),
  });
}

/** An active membership in a restaurant that is open for work (not being deleted). */
export async function workableMembership(userId: string, restaurantId: string) {
  return runWithoutTenant(async () => {
    const [member, restaurant] = await Promise.all([
      StaffMember.findOne({ userId, restaurantId, status: 'active' }),
      Restaurant.findById(restaurantId).catch(() => null),
    ]);
    return member && restaurant?.status === 'active' ? member : null;
  });
}

/** The first restaurant someone can work in, oldest membership first. */
export async function firstWorkableMembership(userId: string) {
  return runWithoutTenant(async () => {
    const members = await StaffMember.find({ userId, status: 'active' }).sort({ joinedAt: 1 });
    for (const member of members) {
      const restaurant = await Restaurant.findById(member.restaurantId);
      if (restaurant?.status === 'active') return member;
    }
    return null;
  });
}

export const isOwnerMembership = (member: IStaffMember) => Boolean(member.isOwner || member.isPrimaryOwner);

/** The open branches this member may work in, oldest first. */
export async function openBranchesFor(member: IStaffMember) {
  const branches = await runWithoutTenant(() =>
    Branch.find({ restaurantId: member.restaurantId, isActive: { $ne: false } }).sort({ createdAt: 1 })
  );
  if (isOwnerMembership(member) || member.branchScope === 'all') return branches;
  return branches.filter((branch) => member.branchIds.includes(String(branch._id)));
}

/** Everything the member may do; owners (by flag or the Owner role) may do everything. */
export async function permissionsFor(member: IStaffMember): Promise<Permission[]> {
  if (isOwnerMembership(member)) return ALL_PERMISSIONS;
  const roles = await runWithoutTenant(() => Role.find({ _id: { $in: member.roleIds }, restaurantId: member.restaurantId }));
  if (roles.some((role) => role.key === 'owner')) return ALL_PERMISSIONS;
  const granted = new Set(roles.flatMap((role) => role.permissions));
  return ALL_PERMISSIONS.filter((permission) => granted.has(permission));
}

const DEFAULT_SETTINGS = {
  taxByPaymentMethod: { cash: 16, card: 5, jazzcash: 5, easypaisa: 5, bank: 5 },
  whatsappTemplates: { winback: '', reservation: '' },
};

/** The settings as `/me` carries them; a restaurant without a settings record gets the defaults. */
function settingsJson(settings: InstanceType<typeof Settings> | null, restaurantName: string): RestaurantSettings {
  const saved = settings?.toObject() as Partial<RestaurantSettings> | undefined;
  return {
    restaurantName: saved?.restaurantName ?? restaurantName,
    logo: saved?.logo || undefined,
    onboarded: Boolean(saved?.onboarded),
    taxSet: Boolean(saved?.taxSet),
    taxByPaymentMethod: { ...DEFAULT_SETTINGS.taxByPaymentMethod, ...saved?.taxByPaymentMethod },
    whatsappTemplates: { ...DEFAULT_SETTINGS.whatsappTemplates, ...saved?.whatsappTemplates },
    receipt: { ...saved?.receipt },
    updatedAt: saved?.updatedAt ? String(saved.updatedAt) : undefined,
  };
}

/** The open restaurants someone works at, oldest membership first. */
async function workableRestaurants(userId: string) {
  return runWithoutTenant(async () => {
    const members = await StaffMember.find({ userId, status: 'active' }).sort({ joinedAt: 1 });
    const ids = members.map((m) => String(m.restaurantId));
    const restaurants = await Restaurant.find({ _id: { $in: ids }, status: 'active' });
    const names = new Map(restaurants.map((r) => [String(r.id), r.name]));
    return ids.flatMap((id) => (names.has(id) ? [{ _id: id, name: names.get(id)! }] : []));
  });
}

interface MeInput {
  user: { id: string; name: string; email: string; image?: string | null };
  via: 'web' | 'pos';
  membership?: IStaffMember;
  branchId?: string;
  device?: IDevice;
}

/** The answer of `GET /me`, from what the auth guard put on the request. */
export function buildMe(c: Context): Promise<Me> {
  return describeMe({
    user: c.get('user'),
    via: c.get('via') === 'pos' ? 'pos' : 'web',
    membership: c.get('membership'),
    branchId: c.get('branchId'),
    device: c.get('device'),
  });
}

/**
 * `/me` for a sign-in that just started (signing in, switching account): its saved restaurant if still workable,
 * else their first one, saved on the session. Lets those answers carry `me`, so the app never asks again.
 */
export async function meForSession(user: MeInput['user'], session: { token: string; activeRestaurantId?: string | null; activeBranchId?: string | null }) {
  const saved = session.activeRestaurantId ? await workableMembership(user.id, session.activeRestaurantId) : null;
  const member = saved ?? (await firstWorkableMembership(user.id));
  if (!saved) await saveWorkplace(session.token, member ? String(member.restaurantId) : null);
  return describeMe({ user, via: 'web', membership: member ?? undefined, branchId: saved ? (session.activeBranchId ?? undefined) : undefined });
}

/** Who they are, where they work and what they may do there. */
export async function describeMe({ user, via, membership, branchId, device }: MeInput): Promise<Me> {
  let workplace: Me['workplace'] = null;
  if (membership) {
    const [restaurant, roles, branches, permissions, settings] = await Promise.all([
      runWithoutTenant(() => Restaurant.findById(membership.restaurantId)),
      runWithoutTenant(() => Role.find({ _id: { $in: membership.roleIds }, restaurantId: membership.restaurantId })),
      openBranchesFor(membership),
      permissionsFor(membership),
      runWithoutTenant(() => Settings.findOne({ restaurantId: membership.restaurantId })),
    ]);
    // A terminal shows only its own branch.
    const choices = device ? branches.filter((b) => String(b._id) === device.branchId) : branches;
    const branch = choices.find((b) => String(b._id) === branchId) ?? choices[0] ?? null;
    workplace = {
      restaurant: { _id: String(membership.restaurantId), name: restaurant?.name ?? 'Restaurant', logo: restaurant?.logo || undefined },
      membershipId: String(membership._id),
      roleNames: roles.map((role) => role.name),
      isOwner: isOwnerMembership(membership) || roles.some((role) => role.key === 'owner'),
      isPrimaryOwner: Boolean(membership.isPrimaryOwner),
      hasPin: Boolean(membership.pinHash),
      permissions,
      // Its contact details are printed on receipts.
      branch: branch ? { _id: String(branch._id), name: branch.name, address: branch.address, area: branch.area, city: branch.city, phone: branch.phone } : null,
      allBranches: !device && (isOwnerMembership(membership) || membership.branchScope === 'all'),
      branches: choices.map((b) => ({ _id: String(b._id), name: b.name })),
      settings: settingsJson(settings, restaurant?.name ?? 'Restaurant'),
    };
  }

  // The switcher's list: only for someone's own sign-in.
  const restaurants = via === 'pos' ? [] : await workableRestaurants(user.id);

  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
    mode: via,
    workplace,
    restaurants,
    device: device ? { _id: String(device._id), name: device.name, settings: device.settings } : null,
  };
}

/**
 * After joining, creating or switching: save the restaurant (and branch) on this sign-in and answer with the new `/me`.
 */
export async function moveTo(c: Context, member: IStaffMember, branchId?: string) {
  const branches = await openBranchesFor(member);
  const branch = branches.find((b) => String(b._id) === branchId) ?? branches[0];
  const session = c.get('session');
  if (session?.token) await saveWorkplace(session.token, String(member.restaurantId), branch ? String(branch._id) : null);

  c.set('membership', member);
  c.set('restaurantId', String(member.restaurantId));
  c.set('isOwner', isOwnerMembership(member));
  c.set('branchId', branch ? String(branch._id) : undefined);
  return buildMe(c);
}
