import { randomInt } from 'node:crypto';

/** Unpredictable six-digit printer pairing code, expiring ten minutes after creation. */
export default function newPairing() {
  return {
    code: String(randomInt(0, 1_000_000)).padStart(6, '0'),
    expiresAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  };
}
