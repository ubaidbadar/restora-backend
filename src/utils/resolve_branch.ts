import type { Context } from 'hono';
import Branch from '../models/branch';
import type { IStaffMember } from '../models/staff_member';
import httpError from './http_error';
import type { Workplace } from './workplace';

/**
 * The branch a write is for: the one named in the body, else the active branch.
 * It must belong to this restaurant, be open, and be one the person may work in.
 */
export default async function resolveBranchId(c: Context, requested?: string | null): Promise<string> {
  // Someone's own sign-in or an unlocked terminal: the auth guard already loaded the branches they work in.
  const workplace = c.get('workplace') as Workplace | undefined;
  if (workplace) {
    const branchId = requested || (c.get('branchId') as string | undefined) || (workplace.branches.length === 1 ? workplace.branches[0]!._id : undefined);
    if (!branchId) throw httpError(400, 'Pick a branch first');
    if (workplace.branches.some((b) => b._id === branchId)) return branchId;
    if (!workplace.openBranches.some((b) => b._id === branchId)) throw httpError(400, 'That branch is not open in this restaurant');
    throw httpError(403, 'You do not work in that branch');
  }

  let branchId = requested || (c.get('branchId') as string | undefined);
  if (!branchId) {
    // No branch picked: fine when the restaurant has only one open branch.
    const open = await Branch.find({ isActive: { $ne: false } }).limit(2);
    if (open.length !== 1) throw httpError(400, 'Pick a branch first');
    branchId = String(open[0]!._id);
  }

  const branch = await Branch.findById(branchId).catch(() => null);
  if (!branch || branch.isActive === false) throw httpError(400, 'That branch is not open in this restaurant');

  const membership = c.get('membership') as IStaffMember | undefined;
  const isOwner = c.get('isOwner') as boolean | undefined;
  if (!isOwner && membership?.branchScope === 'list' && !membership.branchIds.includes(branchId)) {
    throw httpError(403, 'You do not work in that branch');
  }
  return branchId;
}
