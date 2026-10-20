import type { Context, Next } from 'hono';

/** Only from someone's own sign-in, never from a shared POS terminal. */
export async function requireWeb(c: Context, next: Next) {
  if (c.get('via') !== 'web') {
    return c.json({ message: 'Sign in to your own account for this' }, 403);
  }
  await next();
}

export default requireWeb;
