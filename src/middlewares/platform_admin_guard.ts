import type { Context, Next } from 'hono';
import auth from '../config/auth';
import PlatformAdmin from '../models/platform_admin';
import { runWithoutTenant } from './tenant_context';

export interface PlatformAdminIdentity { userId: string; email: string; role: 'owner' | 'analyst' | 'support' }

/** Fail closed by default. Bootstrap owners are listed in a server-only env variable. */
export async function platformAdminGuard(c: Context, next: Next) {
  const origin = c.req.header('origin');
  const authorizedOrigins = (process.env.PLATFORM_ADMIN_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
  // Browser requests require an explicit allowlisted Origin. No wildcard CORS.
  if (origin && !authorizedOrigins.includes(origin)) return c.json({ message: 'Origin not allowed' }, 403);
  const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
  const user = session?.user;
  if (!user?.id || !user.email || user.emailVerified !== true) return c.json({ message: 'Verified sign-in required' }, 401);

  const bootstrap = (process.env.PLATFORM_ADMIN_BOOTSTRAP_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
  const isBootstrapOwner = bootstrap.includes(user.email.toLowerCase());
  const member = await runWithoutTenant(() => PlatformAdmin.findOne({ userId: user.id, enabled: true }).lean());
  if (!isBootstrapOwner && !member) return c.json({ message: 'Platform access denied' }, 403);
  const identity: PlatformAdminIdentity = { userId: user.id, email: user.email,
    role: isBootstrapOwner ? 'owner' : member!.role };
  c.set('platformAdmin', identity);
  await next();
}

export function requirePlatformOwner(c: Context): PlatformAdminIdentity | null {
  const identity = c.get('platformAdmin') as PlatformAdminIdentity | undefined;
  return identity?.role === 'owner' ? identity : null;
}
