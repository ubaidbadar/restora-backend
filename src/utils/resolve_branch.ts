import type { Context } from 'hono';
import Branch from '../models/branch';
import type { IStaffMember } from '../models/staff_member';
import httpError from './http_error';

/**
 * The branch a write is for: the one named in the body, else the active branch.
 * It must belong to this restaurant, be open, and be one the person may work in.
 */
export default async function resolveBranchId(c: Context, requested?: string | null): Promise<string> {
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
