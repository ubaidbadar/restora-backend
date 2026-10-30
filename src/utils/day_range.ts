import type { Context } from 'hono';
import dayKey from './day_key';

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The days a request asks for, both included: `?from=&to=`, or one `?date=`, or today. Null when a day is malformed or
 * `to` comes before `from`. Days are YYYY-MM-DD strings, so they compare in order as text (like `dayKey` on orders).
 */
export default function dayRange(c: Context): { from: string; to: string } | null {
  const from = c.req.query('from') || c.req.query('date') || dayKey();
  const to = c.req.query('to') || from;
  return DAY.test(from) && DAY.test(to) && from <= to ? { from, to } : null;
}
