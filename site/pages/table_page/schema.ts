import { z } from 'zod/mini';

/**
 * A guest asking for the restaurant's offers on WhatsApp. The API checks the number again and saves the customer.
 * zod/mini: the same checks as zod in a fraction of the script a guest's phone downloads.
 */
const offersSchema = z.object({
  name: z.optional(z.pipe(z.string().check(z.trim(), z.maxLength(80)), z.transform((name) => name || undefined))),
  phone: z.string().check(z.trim(), z.regex(/^[\d\s+()-]{10,20}$/, 'Enter a mobile number like 0300 1234567.')),
  consent: z.literal(true, { error: 'Tick the box to agree.' }),
});

export default offersSchema;
