import { z } from 'zod';
import CANCEL_REASONS from '../constants/cancel_reasons';

/** The reason is optional so that app versions from before reasons existed (and their offline outbox) can still cancel. */
export const orderCancelSchema = z
  .object({
    reason: z.enum(CANCEL_REASONS).optional(),
    note: z.string().trim().max(200, 'Keep the note under 200 characters').optional(),
    cancelledBy: z.string().optional(),
    cancelledAt: z.string().optional(),
  })
  .refine((body) => body.reason !== 'other' || Boolean(body.note), { path: ['note'], message: 'Say why the order was cancelled' });

export default orderCancelSchema;
