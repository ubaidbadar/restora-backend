import type { Context, Next } from 'hono';
import type Permission from '@shared/permission';
import type { IStaffMember } from '../models/staff_member';
import Role from '../models/role';

/** The permissions the current member has through their roles, loaded once per request. */
async function memberPermissions(c: Context): Promise<{ all: boolean; set: Set<string> }> {
  const cached = c.get('permissions') as { all: boolean; set: Set<string> } | undefined;
  if (cached) return cached;

  const membership = c.get('membership') as IStaffMember | undefined;
  let result = { all: false, set: new Set<string>() };
  if (c.get('isOwner') || membership?.isOwner || membership?.isPrimaryOwner) {
    result = { all: true, set: new Set() };
  } else if (membership) {
    const roles = await Role.find({ _id: { $in: membership.roleIds } });
    result = {
      all: roles.some((role) => role.key === 'owner'),
      set: new Set(roles.flatMap((role) => role.permissions)),
    };
  }
  c.set('permissions', result);
  return result;
}

/** True when the current member may do `permission` (owners may do everything). */
export async function hasPermission(c: Context, permission: Permission): Promise<boolean> {
  if (!c.get('membership')) return false;
  const perms = await memberPermissions(c);
  return perms.all || perms.set.has(permission);
}

/** Anyone working at the current restaurant, whatever their role. */
export async function requireMember(c: Context, next: Next) {
  if (!c.get('membership')) {
    return c.json({ message: 'Open a restaurant you work at first' }, 403);
  }
  await next();
}

export function requirePermission(permission: Permission) {
  return async (c: Context, next: Next) => {
    if (!(await hasPermission(c, permission))) {
      return c.json({ message: 'Forbidden: Insufficient permissions' }, 403);
    }
    await next();
  };
}

export function requireAnyPermission(permissions: Permission[]) {
  return async (c: Context, next: Next) => {
    for (const permission of permissions) {
      if (await hasPermission(c, permission)) {
        await next();
        return;
      }
    }
    return c.json({ message: 'Forbidden: Insufficient permissions' }, 403);
  };
}

export default requirePermission;
