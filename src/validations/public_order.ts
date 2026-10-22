import { z } from 'zod';
import { orderItemInputSchema } from './order';

/** A guest's order from the table's QR page: just the dishes. Prices, table and branch come from the server. */
export const publicOrderSchema = z.object({
  items: z.array(orderItemInputSchema.extend({ qty: z.coerce.number().int().min(1).max(20) })).min(1, 'Add at least one dish').max(30),
  clientId: z.string().trim().min(8).max(64).optional(),
});

export default publicOrderSchema;
