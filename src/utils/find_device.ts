import Branch from '../models/branch';
import Device, { type IDevice } from '../models/device';
import Restaurant from '../models/restaurant';
import { toObjectId } from './auth_users';
import lookup from './lookup';
import { runWithoutTenant } from '../middlewares/tenant_context';
import hashToken from './hash_token';

/**
 * The POS terminal holding this token. Tokens are looked up by their SHA-256 (indexed), so a request costs one query.
 * Terminals registered before `tokenLookup` existed are checked against their Argon2 hash once, then backfilled.
 */
export default async function findDeviceByToken(token: string | undefined) {
  if (!token || token.length < 20 || token.length > 200) return null;
  const lookup = hashToken(token);

  return runWithoutTenant(async () => {
    const device = await Device.findOne({ tokenLookup: lookup });
    if (device) return device;

    const legacy = await Device.find({ tokenLookup: { $exists: false } }).limit(50);
    for (const candidate of legacy) {
      if (await Bun.password.verify(token, candidate.tokenHash)) {
        candidate.tokenLookup = lookup;
        await candidate.save();
        return candidate;
      }
    }
    return null;
  });
}

/** Whether a terminal still works: its branch is open, in a restaurant that is open. One aggregation. */
export async function terminalInUse(device: Pick<IDevice, 'branchId' | 'restaurantId'>): Promise<boolean> {
  const branchId = toObjectId(device.branchId);
  if (!branchId) return false;
  const found = await runWithoutTenant(() =>
    Branch.aggregate([
      { $match: { _id: branchId, restaurantId: String(device.restaurantId), isActive: { $ne: false } } },
      ...lookup({ from: Restaurant, localField: 'restaurantId', as: 'restaurant', pipeline: [{ $match: { status: 'active' } }, { $project: { _id: 1 } }] }),
      { $match: { 'restaurant.0': { $exists: true } } },
      { $project: { _id: 1 } },
    ])
  );
  return found.length > 0;
}
