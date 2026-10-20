import { zValidator } from '@hono/zod-validator';
import type { ZodType } from 'zod';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateBody<T extends ZodType<any, any, any>>(schema: T) {
  return zValidator('json', schema, (result, c) => {
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue?.message || 'Invalid input';
      return c.json({ message, issues: result.error.issues }, 400);
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (c as any).set('validatedJson', result.data);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function validateQuery<T extends ZodType<any, any, any>>(schema: T) {
  return zValidator('query', schema, (result, c) => {
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      const message = firstIssue?.message || 'Invalid query';
      return c.json({ message, issues: result.error.issues }, 400);
    }
  });
}

export default validateBody;
