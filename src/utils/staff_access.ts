import type { Context } from 'hono';
import Role from '../models/role';
import Branch from '../models/branch';
import type { IStaffMember } from '../models/staff_member';
import httpError from './http_error';

/** True for anyone with owner powers, through the flags or the Owner role. */
export function isOwnerMember(member: Pick<IStaffMember, 'isOwner' | 'isPrimaryOwner' | 'roleIds'>, ownerRoleIds: Set<string>): boolean {
  return Boolean(member.isOwner || member.isPrimaryOwner || member.roleIds.some((id) => ownerRoleIds.has(id)));
}

export async function ownerRoleIds(): Promise<Set<string>> {
  const roles = await Role.find({ key: 'owner' });
  return new Set(roles.map((r) => String(r._id)));
}

/**
 * Checks roles and branches given to someone (an access change or an invitation):
 * every id must exist in this restaurant, and only an owner may hand out the Owner role.
 * Returns whether the Owner role is among them.
 */
export async function checkAccessGrant(c: Context, roleIds: string[], branchScope: 'all' | 'list', branchIds: string[]): Promise<boolean> {
  const uniqueRoles = [...new Set(roleIds)];
  const roles = await Role.find({ _id: { $in: uniqueRoles } }).catch(() => []);
  if (roles.length !== uniqueRoles.length) throw httpError(400, 'One of the roles does not exist');

  if (branchScope === 'list') {
    const uniqueBranches = [...new Set(branchIds)];
    const branches = await Branch.find({ _id: { $in: uniqueBranches } }).catch(() => []);
    if (branches.length !== uniqueBranches.length) throw httpError(400, 'One of the branches does not exist');
  }

  const grantsOwner = roles.some((r) => r.key === 'owner');
  if (grantsOwner && !c.get('isOwner')) throw httpError(403, 'Only an owner can make someone an owner');
  return grantsOwner;
}
