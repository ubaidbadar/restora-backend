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
import GuestRequest from '../models/guest_request';
import Table from '../models/table';
import StaffMember, { type IStaffMember } from '../models/staff_member';
import type { IDevice } from '../models/device';
import { runWithoutTenant } from '../middlewares/tenant_context';
import lookup from './lookup';

const ALL_PERMISSIONS = PERMISSION_CATALOG.map((entry) => entry.permission) as Permission[];

type BranchInfo = NonNullable<Me['workplace']>['branch'] & {};

/** Where someone works and what they may do there. Loaded once per request by the auth guard. */
export interface Workplace {
  /** A real document (it can be saved, e.g. a new PIN). */
  member: InstanceType<typeof StaffMember>;
  restaurant: { _id: string; name: string; logo?: string };
  roleNames: string[];
  isOwner: boolean;
  permissions: Permission[];
  /** Every open branch of the restaurant, oldest first. */
  openBranches: BranchInfo[];
  /** The open branches this member may work in. */
  branches: BranchInfo[];
  /** The branch they work in now. */
  branch: BranchInfo | null;
  settings?: Partial<RestaurantSettings>;
  /** Open guest calls in every branch, loaded only for `/me` (see `loadWorkplace`). */
  calls?: (WorkplaceCall & { branchId: string })[];
}

type WorkplaceCall = NonNullable<NonNullable<Me['workplace']>['calls']>[number];

type Found = IStaffMember & {
  restaurant: Workplace['restaurant'];
  roleNames: string[];
  owner: boolean;
  granted: string[];
  openBranches: BranchInfo[];
  branches: BranchInfo[];
  settings?: Partial<RestaurantSettings>;
  calls?: Workplace['calls'];
};

/**
 * One aggregation: every restaurant of the matched memberships (the restaurants page and the switcher), and one of them
 * (the wanted restaurant if they still work there, else the oldest open one) with its roles, open branches and settings.
 * The current branch is the wanted one if it is theirs, else their first; on a terminal (`pos`) only the wanted one.
 * With `calls` (only for `/me`) it also brings the guests' open calls, so the app needs no other request to start.
 */
export async function loadWorkplace(match: Record<string, unknown>, restaurantId?: string | null, branchId?: string | null, pos = false, calls = false) {
  const [result] = await runWithoutTenant(() =>
    StaffMember.aggregate<{ restaurants: Me['restaurants']; current: Found[] }>([
      { $match: match },
      ...lookup({ from: Restaurant, localField: 'restaurantId', as: 'restaurant', pipeline: [{ $project: { _id: { $toString: '$_id' }, name: 1, logo: 1, status: 1, deleteAfter: 1 } }] }),
      { $unwind: '$restaurant' },
      { $sort: { joinedAt: 1 } },
      {
        $facet: {
          restaurants: [
            // A restaurant being deleted is listed only for its owner, who can keep it.
            { $match: { $or: [{ 'restaurant.status': 'active' }, { 'restaurant.status': 'deleting', isPrimaryOwner: true }] } },
            {
              $project: {
                _id: '$restaurant._id',
                name: '$restaurant.name',
                logo: { $cond: [{ $eq: [{ $ifNull: ['$restaurant.logo', ''] }, ''] }, '$$REMOVE', '$restaurant.logo'] },
                isOwner: { $cond: [{ $or: ['$isOwner', '$isPrimaryOwner'] }, true, '$$REMOVE'] },
                status: { $cond: [{ $eq: ['$restaurant.status', 'deleting'] }, 'deleting', { $cond: [{ $eq: ['$status', 'suspended'] }, 'suspended', '$$REMOVE'] }] },
                deleteAfter: { $cond: [{ $eq: ['$restaurant.status', 'deleting'] }, '$restaurant.deleteAfter', '$$REMOVE'] },
              },
            },
          ],
          current: [
            // Only an active membership of an open restaurant is a workplace.
            { $match: { status: 'active', 'restaurant.status': 'active' } },
            { $addFields: { __wanted: { $eq: ['$restaurantId', restaurantId ?? null] } } },
            { $sort: { __wanted: -1, joinedAt: 1 } },
            { $limit: 1 },
            { $unset: '__wanted' },
            // Joins compare restaurantId too, so a membership never picks up another restaurant's roles.
            ...lookup({ from: Role, localField: 'roleIds', as: 'roles', let: { rid: '$restaurantId' }, pipeline: [{ $match: { $expr: { $eq: ['$restaurantId', '$$rid'] } } }] }),
            ...lookup({
              from: Branch,
              localField: 'restaurantId',
              foreignField: 'restaurantId',
              as: 'openBranches',
              pipeline: [{ $match: { isActive: { $ne: false } } }, { $sort: { createdAt: 1 } }, { $project: { _id: { $toString: '$_id' }, name: 1, address: 1, area: 1, city: 1, phone: 1 } }],
            }),
            ...lookup({ from: Settings, localField: 'restaurantId', foreignField: 'restaurantId', as: 'settings' }),
            // Calls from the tables' QR pages not yet seen to, oldest first, leaving out archived tables (as the floor does).
            ...(calls
              ? lookup({
                  from: GuestRequest,
                  localField: 'restaurantId',
                  foreignField: 'restaurantId',
                  as: 'calls',
                  pipeline: [
                    { $match: { resolved: false } },
                    { $sort: { createdAt: 1 } },
                    ...lookup({ from: Table, localField: 'tableId', as: 'table', pipeline: [{ $match: { archived: { $ne: true } } }, { $project: { name: 1 } }] }),
                    { $match: { 'table.0': { $exists: true } } },
                    { $project: { _id: { $toString: '$_id' }, branchId: 1, tableId: 1, tableName: { $first: '$table.name' }, type: 1, createdAt: 1 } },
                  ],
                })
              : []),
            {
              $addFields: {
                owner: { $or: ['$isOwner', '$isPrimaryOwner', { $in: ['owner', '$roles.key'] }] },
                roleNames: '$roles.name',
                granted: { $reduce: { input: '$roles.permissions', initialValue: [], in: { $setUnion: ['$$value', '$$this'] } } },
                settings: { $first: '$settings' },
              },
            },
            {
              $addFields: {
                branches: {
                  $cond: [
                    { $or: ['$owner', { $eq: ['$branchScope', 'all'] }] },
                    '$openBranches',
                    { $filter: { input: '$openBranches', cond: { $in: ['$$this._id', { $ifNull: ['$branchIds', []] }] } } },
                  ],
                },
              },
            },
            { $unset: 'roles' },
          ],
        },
      },
    ])
  );
  const restaurants = result?.restaurants ?? [];
  const found = result?.current[0];
  if (!found) return { restaurants, workplace: null };

  const { restaurant, roleNames, owner, granted, openBranches, branches, settings, calls: openCalls, ...member } = found;
  const workplace: Workplace = {
    member: StaffMember.hydrate(member),
    restaurant: { _id: restaurant._id, name: restaurant.name, logo: restaurant.logo || undefined },
    roleNames,
    isOwner: owner,
    permissions: owner ? ALL_PERMISSIONS : ALL_PERMISSIONS.filter((permission) => granted.includes(permission)),
    openBranches,
    branches,
    branch: branches.find((b) => b._id === branchId) ?? (pos ? null : (branches[0] ?? null)),
    settings,
    calls: openCalls,
  };
  return { restaurants, workplace };
}

/** Puts the workplace on the request (membership, restaurant, branch, permissions), or clears it. */
export function enterWorkplace(c: Context, { workplace, restaurants }: Awaited<ReturnType<typeof loadWorkplace>>) {
  c.set('workplace', workplace ?? undefined);
  c.set('restaurants', restaurants);
  c.set('membership', workplace?.member);
  c.set('restaurantId', workplace?.restaurant._id);
  c.set('branchId', workplace?.branch?._id);
  c.set('isOwner', workplace?.isOwner);
  c.set('permissions', workplace ? { all: workplace.isOwner, set: new Set(workplace.permissions) } : undefined);
}

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
 * Where someone's own sign-in works: the restaurant and branch saved on its session while they still work there, else
 * their oldest restaurant (saved on the session).
 */
export async function sessionWorkplace(userId: string, session: { token: string; activeRestaurantId?: string | null; activeBranchId?: string | null }, calls = false) {
  const wanted = session.activeRestaurantId || null;
  const found = await loadWorkplace({ userId }, wanted, session.activeBranchId, false, calls);
  const restaurantId = found.workplace?.restaurant._id ?? null;
  if (restaurantId !== wanted) await saveWorkplace(session.token, restaurantId);
  return found;
}

const DEFAULT_SETTINGS = {
  taxByPaymentMethod: { cash: 16, card: 5, jazzcash: 5, easypaisa: 5, bank: 5 },
  whatsappTemplates: { winback: '', reservation: '' },
};

/** `/me` from what is already loaded: no database work. */
export function toMe({ user, via, device, workplace, restaurants }: { user: Omit<Me['user'], 'image'> & { image?: string | null }; via?: 'web' | 'pos'; device?: IDevice; workplace?: Workplace | null; restaurants?: Me['restaurants'] }): Me {
  const member = workplace?.member;
  const branch = workplace?.branch;
  const saved = workplace?.settings;
  const receipt = saved?.receipt;
  // The banner's calls: this branch's, for those who see the tables.
  const calls = workplace?.permissions.includes('tables:view')
    ? workplace.calls?.filter((call) => call.branchId === branch?._id).map(({ _id, tableId, tableName, type, createdAt }) => ({ _id, tableId, tableName, type, createdAt: new Date(createdAt).toISOString() }))
    : undefined;
  // Empty fields are left out.
  return {
    user: { id: user.id, name: user.name, email: user.email, image: user.image || undefined },
    mode: via === 'pos' ? 'pos' : 'web',
    workplace:
      workplace && member
        ? {
            restaurant: workplace.restaurant,
            roleNames: workplace.roleNames,
            isOwner: workplace.isOwner,
            isPrimaryOwner: Boolean(member.isPrimaryOwner),
            hasPin: Boolean(member.pinHash),
            permissions: workplace.permissions,
            // Its contact details are printed on receipts.
            branch: branch ? { _id: branch._id, name: branch.name, address: branch.address, area: branch.area, city: branch.city, phone: branch.phone } : null,
            allBranches: !device && Boolean(member.isOwner || member.isPrimaryOwner || member.branchScope === 'all'),
            // A terminal works only in its own branch.
            branches: (device ? (branch ? [branch] : []) : workplace.branches).map((b) => ({ _id: b._id, name: b.name })),
            settings: {
              onboarded: Boolean(saved?.onboarded),
              taxSet: Boolean(saved?.taxSet),
              taxByPaymentMethod: { ...DEFAULT_SETTINGS.taxByPaymentMethod, ...saved?.taxByPaymentMethod },
              whatsappTemplates: { ...DEFAULT_SETTINGS.whatsappTemplates, ...saved?.whatsappTemplates },
              receipt: receipt?.ntn || receipt?.strn || receipt?.footer ? { ntn: receipt.ntn || undefined, strn: receipt.strn || undefined, footer: receipt.footer || undefined } : undefined,
              appearance: { theme: 'indigo', mode: 'light', sidebar: 'plain', ...saved?.appearance },
              updatedAt: saved?.updatedAt ? new Date(saved.updatedAt).toISOString() : undefined,
            },
            calls: calls?.length ? calls : undefined,
          }
        : null,
    // The restaurants page and the switcher: only for someone's own sign-in.
    restaurants: via === 'pos' ? [] : (restaurants ?? []),
    device: device ? { _id: String(device._id), name: device.name, settings: device.settings } : undefined,
  };
}

/**
 * Moves this sign-in to a restaurant (and branch) and answers with the new `/me`: after joining, creating or switching.
 * Without a restaurant they move to their oldest open one (or none). Null when a named restaurant is not theirs.
 */
export async function moveTo(c: Context, restaurantId?: string | null, branchId?: string | null): Promise<Me | null> {
  const found = await loadWorkplace({ userId: c.get('user').id }, restaurantId, branchId);
  if (restaurantId && found.workplace?.restaurant._id !== restaurantId) return null;
  enterWorkplace(c, found);
  const session = c.get('session');
  if (session?.token) await saveWorkplace(session.token, found.workplace?.restaurant._id ?? null, found.workplace?.branch?._id ?? null);
  return toMe(c.var);
}
