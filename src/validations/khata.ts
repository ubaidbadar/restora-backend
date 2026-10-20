import { z } from 'zod';

/**
 * Entries staff add by hand: a payment received (lowers what they owe) or an adjustment (either way).
 * Order, opening, reversal and merge lines are only written by the server.
 */
export const khataEntryCreateSchema = z
  .object({
    type: z.enum(['payment', 'adjustment']),
    amount: z.coerce.number({ error: 'Enter the amount' }).finite(),
    note: z.string().trim().max(200).optional().nullable(),
  })
  .refine((entry) => entry.amount !== 0, { error: 'Enter an amount other than 0', path: ['amount'] })
  .refine((entry) => entry.type !== 'payment' || entry.amount > 0, { error: 'A payment is more than 0', path: ['amount'] });

export default khataEntryCreateSchema;
