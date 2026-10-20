import { z } from 'zod';

const cell = z
  .union([z.string(), z.number()])
  .optional()
  .nullable()
  .transform((val) => (val === null || val === undefined ? undefined : String(val).trim() || undefined));

/** Rows as the client's import page sends them, one object per sheet row (in sheet order, so row numbers match). */
export const customerImportSchema = z.object({
  customers: z
    .array(
      z.object({
        name: cell,
        phone: cell,
        area: cell,
        openingKhata: z.coerce.number().finite().optional().nullable(),
      })
    )
    .min(1, 'Upload at least one row of customers')
    .max(5000, 'Up to 5,000 customers at a time'),
  onExisting: z.enum(['skip', 'fill']).default('skip'),
});

export default customerImportSchema;
