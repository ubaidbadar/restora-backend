import type { Context, Next } from 'hono';

const FRESH_MS = 10 * 60 * 1000;

/** For the riskiest actions (transfer, delete, PIN): the sign-in must be from the last 10 minutes. */
export async function requireFreshSession(c: Context, next: Next) {
  const createdAt = c.get('session')?.createdAt as Date | string | undefined;
  if (c.get('via') !== 'web' || !createdAt || Date.now() - new Date(createdAt).getTime() > FRESH_MS) {
    return c.json({ code: 'reauth_required', message: 'For your safety, sign out and sign in again, then try once more.' }, 403);
  }
  await next();
}

export default requireFreshSession;
