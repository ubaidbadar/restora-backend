import { createHash } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import RateLimitBucket from '../models/rate_limit_bucket';

type Options = {
  scope: string;
  limit: number;
  windowMs: number;
  methods?: string[];
};

function clientAddress(c: Parameters<MiddlewareHandler>[0]): string {
  // Cloudflare or the trusted reverse proxy must overwrite these headers.
  // For X-Forwarded-For, the last hop is the address added by the proxy.
  const forwarded = c.req.header('x-forwarded-for')?.split(',').map((value) => value.trim()).filter(Boolean).at(-1);
  return (c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || forwarded || 'unknown').slice(0, 128);
}

export default function rateLimit(options: Options): MiddlewareHandler {
  return async (c, next) => {
    if (options.methods && !options.methods.includes(c.req.method)) return next();

    const now = Date.now();
    const windowStart = Math.floor(now / options.windowMs) * options.windowMs;
    const key = createHash('sha256')
      .update(options.scope + ':' + clientAddress(c) + ':' + windowStart)
      .digest('hex');
    let bucket;
    try {
      try {
        bucket = await RateLimitBucket.findOneAndUpdate(
          { _id: key },
          { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + options.windowMs * 2) } },
          { upsert: true, returnDocument: 'after' },
        );
      } catch (error) {
        // Concurrent first requests can race to insert the same deterministic bucket.
        if ((error as { code?: number }).code !== 11000) throw error;
        bucket = await RateLimitBucket.findOneAndUpdate(
          { _id: key }, { $inc: { count: 1 } }, { returnDocument: 'after' },
        );
      }
    } catch (error) {
      console.error('[RateLimit] Could not record request', error instanceof Error ? error.message : 'unknown error');
      return c.json({ message: 'Request protection is temporarily unavailable. Please try again shortly.' }, 503);
    }

    if (!bucket) return c.json({ message: 'Request protection is temporarily unavailable. Please try again shortly.' }, 503);
    const resetAt = windowStart + options.windowMs;
    const remaining = Math.max(0, options.limit - bucket.count);
    c.header('X-RateLimit-Limit', String(options.limit));
    c.header('X-RateLimit-Remaining', String(remaining));
    c.header('X-RateLimit-Reset', String(Math.ceil(resetAt / 1000)));
    if (bucket.count > options.limit) {
      c.header('Retry-After', String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
      return c.json({ message: 'Too many requests. Please wait before trying again.' }, 429);
    }
    return next();
  };
}
