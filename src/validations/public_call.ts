import { z } from 'zod';

/** The client sends `kind`; `type` is accepted too. */
export const publicCallSchema = z
  .object({
    kind: z.enum(['waiter', 'bill']).optional(),
    type: z.enum(['waiter', 'bill']).optional(),
  })
  .transform((body) => ({ type: body.kind ?? body.type }))
  .refine((body) => body.type !== undefined, { error: 'Say whether you need a waiter or the bill' });

export default publicCallSchema;
