import type { Context } from 'hono';
import type { PipelineStage } from 'mongoose';
import auth from '../config/auth';
import PERMISSION_CATALOG from '@shared/permission_catalog';
import type Permission from '@shared/permission';
import type Me from '@shared/me';
import type RestaurantSettings from '@shared/restaurant_settings';
import Branch, { type IBranch } from '../models/branch';
import Restaurant from '../models/restaurant';
import Role from '../models/role';
import Settings, { type ISettings } from '../models/settings';
import StaffMember, { type IStaffMember } from '../models/staff_member';
import type { IDevice } from '../models/device';
import { runWithoutTenant } from '../middlewares/tenant_context';
import lookup from './lookup';
import { toObjectId } from './auth_users';

const ALL_PERMISSIONS = PERMISSION_CATALOG.map((entry) => entry.permission) as Permission[];

type BranchInfo = Pick<IBranch, 'name' | 'address' | 'area' | 'city' | 'phone'> & { _id: unknown };

/** Where someone works and what they may do there: one membership with its restaurant, roles, branches and settings. */
export interface Workplace {
  /** A real document (it can be saved, e.g. a new PIN). */
  member: InstanceType<typeof StaffMember>;
  restaurant: { _id: unknown; name: string; logo?: string };
  roles: { _id: unknown; name: string; key?: string; permissions: string[] }[];
  /** Every open branch of the restaurant, oldest first. */
  openBranches: BranchInfo[];
  /** The open branches this member may work in. */
  branches: BranchInfo[];
  settings?: ISettings;
  isOwner: boolean;
  permissions: Permission[];
}

export const isOwnerMembership = (member: Pick<IStaffMember, 'isOwner' | 'isPrimaryOwner'>) => Boolean(member.isOwner || member.isPrimaryOwner);

/** Saves on the sign-in session where it works. Only the server writes these fields. */
export async function saveWorkplace(sessionToken: string, restaurantId: string | null, branchId: string | null = null) {
  const context = await auth.$context;
  await context.internalAdapter.updateSession(sessionToken, {
    activeRestaurantId: restaurantId,
    activeBranchId: branchId,
    updatedAt: new Date(),
  });
}

/**
 * One aggregation for everything about where someone works: their memberships in open restaurants (the switcher's
 * list), and for one of them (the wanted restaurant if they still work there, else the oldest) its roles, open
 * branches and settings. Joins compare restaurantId too, so a membership never picks up another restaurant's roles.
 */
function workplacePipeline(match: Record<string, unknown>, wantedRestaurantId?: string | null): PipelineStage[] {
  return [
    { $match: match },
    ...lookup({ from: Restaurant, localField: 'restaurantId', as: 'restaurant', pipeline: [{ $match: { status: 'active' } }, { $project: { name: 1, logo: 1 } }] }),
    // Memberships of closed (being deleted) restaurants drop out here.
    { $unwind: '$restaurant' },
    { $sort: { joinedAt: 1 } },
    {
      $facet: {
        restaurants: [{ $project: { _id: { $toString: '$restaurant._id' }, name: '$restaurant.name' } }],
        current: [
          { $addFields: { __wanted: { $eq: ['$restaurantId', wantedRestaurantId ?? null] } } },
          { $sort: { __wanted: -1, joinedAt: 1 } },
          { $limit: 1 },
          { $unset: '__wanted' },
          ...lookup({
            from: Role,
            localField: 'roleIds',
            as: 'roles',
            let: { rid: '$restaurantId' },
            pipeline: [{ $match: { $expr: { $eq: ['$restaurantId', '$$rid'] } } }, { $project: { name: 1, key: 1, permissions: 1 } }],
          }),
          ...lookup({
            from: Branch,
            localField: 'restaurantId',
            foreignField: 'restaurantId',
            as: 'openBranches',
            pipeline: [{ $match: { isActive: { $ne: false } } }, { $sort: { createdAt: 1 } }, { $project: { name: 1, address: 1, area: 1, city: 1, phone: 1 } }],
          }),
          ...lookup({ from: Settings, localField: 'restaurantId', foreignField: 'restaurantId', as: 'settings' }),
        ],
      },
    },
  ];
}

type Current = IStaffMember & { restaurant: Workplace['restaurant']; roles: Workplace['roles']; openBranches: BranchInfo[]; settings: ISettings[] };

/** Runs the pipeline: the open restaurants of the matched memberships, and the workplace picked among them. */
async function loadWorkplace(match: Record<string, unknown>, wantedRestaurantId?: string | null) {
  const [result] = await runWithoutTenant(() =>
    StaffMember.aggregate<{ restaurants: Me['restaurants']; current: Current[] }>(workplacePipeline(match, wantedRestaurantId))
  );
  const found = result?.current[0];
  if (!found) return { restaurants: result?.restaurants ?? [], workplace: null };

  const { restaurant, roles, openBranches, settings, ...memberFields } = found;
  const owner = isOwnerMembership(found) || roles.some((role) => role.key === 'owner');
  const granted = new Set(roles.flatMap((role) => role.permissions));
  const workplace: Workplace = {
    member: StaffMember.hydrate(memberFields),
    restaurant,
    roles,
    openBranches,
    branches: owner || found.branchScope === 'all' ? openBranches : openBranches.filter((branch) => found.branchIds.includes(String(branch._id))),
    settings: settings[0],
    isOwner: owner,
    permissions: owner ? ALL_PERMISSIONS : ALL_PERMISSIONS.filter((permission) => granted.has(permission)),
  };
  return { restaurants: result.restaurants, workplace };
}

/** The workplace of someone's own sign-in: the wanted restaurant if they still work there, else their oldest one. */
export const loadUserWorkplace = (userId: string, wantedRestaurantId?: string | null) => loadWorkplace({ userId, status: 'active' }, wantedRestaurantId);

/** The workplace of the person unlocked on a POS terminal, in the terminal's restaurant only. */
export const loadMemberWorkplace = (membershipId: string, restaurantId: string) =>
  loadWorkplace({ _id: toObjectId(membershipId), restaurantId, status: 'active' }, restaurantId);

/**
 * Puts the workplace on the request (membership, restaurant, branch, permissions), or clears it. A terminal works only in
 * its own branch; otherwise the wanted branch if it is theirs, else their first.
 */
export function enterWorkplace(c: Context, workplace: Workplace | null, restaurants: Me['restaurants'], wantedBranchId?: string | null) {
  c.set('workplace', workplace ?? undefined);
  c.set('restaurants', restaurants);
  if (!workplace) {
    for (const key of ['membership', 'restaurantId', 'branchId', 'isOwner', 'permissions'] as const) c.set(key, undefined);
    return;
  }
  const device = c.get('device') as IDevice | undefined;
  const choices = device ? workplace.branches.filter((b) => String(b._id) === device.branchId) : workplace.branches;
  const branch = choices.find((b) => String(b._id) === wantedBranchId) ?? choices[0];
  c.set('membership', workplace.member);
  c.set('restaurantId', String(workplace.member.restaurantId));
  c.set('branchId', branch ? String(branch._id) : undefined);
  c.set('isOwner', workplace.isOwner);
  c.set('permissions', { all: workplace.isOwner, set: new Set(workplace.permissions) });
}

const DEFAULT_SETTINGS = {
  taxByPaymentMethod: { cash: 16, card: 5, jazzcash: 5, easypaisa: 5, bank: 5 },
  whatsappTemplates: { winback: '', reservation: '' },
};

/** The settings as `/me` carries them; a restaurant without a settings record gets the defaults. */
function settingsJson(saved: Partial<RestaurantSettings> | undefined, restaurantName: string): RestaurantSettings {
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

/** `/me` from what the auth guard (or a switch) put on the request: no database work. */
export function meOf(c: Context): Me {
  const user = c.get('user') as Me['user'] & { image?: string | null };
  const via = c.get('via') === 'pos' ? 'pos' : 'web';
  const device = c.get('device') as IDevice | undefined;
  const workplace = c.get('workplace') as Workplace | undefined;
  const branchId = c.get('branchId') as string | undefined;
  const choices = workplace ? (device ? workplace.branches.filter((b) => String(b._id) === device.branchId) : workplace.branches) : [];
  const branch = choices.find((b) => String(b._id) === branchId) ?? null;
  const member = workplace?.member;

  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
    mode: via,
    workplace:
      workplace && member
        ? {
            restaurant: { _id: String(member.restaurantId), name: workplace.restaurant.name, logo: workplace.restaurant.logo || undefined },
            membershipId: String(member._id),
            roleNames: workplace.roles.map((role) => role.name),
            isOwner: workplace.isOwner,
            isPrimaryOwner: Boolean(member.isPrimaryOwner),
            hasPin: Boolean(member.pinHash),
            permissions: workplace.permissions,
            // Its contact details are printed on receipts.
            branch: branch ? { _id: String(branch._id), name: branch.name, address: branch.address, area: branch.area, city: branch.city, phone: branch.phone } : null,
            allBranches: !device && (isOwnerMembership(member) || member.branchScope === 'all'),
            branches: choices.map((b) => ({ _id: String(b._id), name: b.name })),
            settings: settingsJson(workplace.settings as Partial<RestaurantSettings> | undefined, workplace.restaurant.name),
          }
        : null,
    // The switcher's list: only for someone's own sign-in.
    restaurants: via === 'pos' ? [] : ((c.get('restaurants') as Me['restaurants'] | undefined) ?? []),
    device: device ? { _id: String(device._id), name: device.name, settings: device.settings } : null,
  };
}

/**
 * Moves this sign-in to a restaurant (and branch) and answers with the new `/me`: after joining, creating or switching.
 * Without a restaurant, or one they no longer work at, they move to their oldest open one (or none). Null when a named
 * restaurant is not theirs.
 */
export async function moveTo(c: Context, restaurantId?: string | null, branchId?: string | null): Promise<Me | null> {
  const { restaurants, workplace } = await loadUserWorkplace(c.get('user').id, restaurantId);
  if (restaurantId && workplace && String(workplace.member.restaurantId) !== restaurantId) return null;
  enterWorkplace(c, workplace, restaurants, branchId);
  const session = c.get('session');
  if (session?.token) await saveWorkplace(session.token, c.get('restaurantId') ?? null, c.get('branchId') ?? null);
  return meOf(c);
}

/**
 * `/me` for a sign-in that just started (signing in, switching account), saved on the session. Lets those answers carry
 * `me`, so the app never asks again.
 */
export async function meForSession(user: Omit<Me['user'], 'image'> & { image?: string | null }, session: { token: string; activeRestaurantId?: string | null; activeBranchId?: string | null }): Promise<Me> {
  const { restaurants, workplace } = await loadUserWorkplace(user.id, session.activeRestaurantId);
  const kept = workplace && String(workplace.member.restaurantId) === session.activeRestaurantId;
  if (!kept) await saveWorkplace(session.token, workplace ? String(workplace.member.restaurantId) : null);
  const vars = new Map<string, unknown>([['user', user], ['via', 'web']]);
  // A small stand-in for a request, so `/me` is made the same way as for any request.
  const c = { get: (key: string) => vars.get(key), set: (key: string, value: unknown) => vars.set(key, value) } as unknown as Context;
  enterWorkplace(c, workplace, restaurants, kept ? session.activeBranchId : null);
  return meOf(c);
}
