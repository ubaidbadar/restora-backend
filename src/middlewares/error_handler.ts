import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { ZodError } from 'zod';

interface ErrorLike {
  name?: string;
  code?: number;
  status?: unknown;
  statusCode?: unknown;
  errors?: Record<string, { message?: string }>;
  body?: { message?: string };
}

export function errorHandler(err: Error, c: Context) {
  const e = err as Error & ErrorLike;

  if (err instanceof ZodError) {
    return c.json({ message: err.issues[0]?.message || 'Invalid input', issues: err.issues }, 400);
  }

  // Mongoose validation and bad ids.
  if (e.name === 'ValidationError') {
    const firstKey = Object.keys(e.errors || {})[0];
    return c.json({ message: (firstKey && e.errors?.[firstKey]?.message) || err.message }, 400);
  }
  if (e.name === 'CastError') {
    return c.json({ message: 'Not found' }, 404);
  }

  if (e.code === 11000) {
    return c.json({ message: 'A record with this unique identifier already exists.' }, 409);
  }

  // Our httpError (`status`) and Better Auth's APIError (`statusCode`).
  const status = typeof e.status === 'number' ? e.status : typeof e.statusCode === 'number' ? e.statusCode : undefined;
  if (status && status >= 400 && status < 600) {
    return c.json({ message: e.body?.message || err.message }, status as ContentfulStatusCode);
  }

  console.error('Unhandled Error:', err);
  // Internal details stay in the log, not in the response.
  return c.json({ message: 'Something went wrong. Please try again.' }, 500);
}

export default errorHandler;
