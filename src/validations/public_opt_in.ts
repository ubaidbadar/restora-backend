import { z } from 'zod';
import { phoneSchema } from './customer';

/** A guest at a table agreeing to WhatsApp offers. */
export const publicOptInSchema = z.object({
  name: z.string().trim().max(80).optional(),
  phone: phoneSchema,
  consent: z.literal(true, { error: 'Tick the box to agree' }),
});

export default publicOptInSchema;
