import Device from '../models/device';
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
