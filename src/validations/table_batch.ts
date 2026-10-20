import { z } from 'zod';

const seatsField = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((val) => (val === null || val === undefined || String(val).trim() === '' ? undefined : Number(val)))
  .pipe(z.number().int().min(1).max(100).optional());

/** The client works out the names ("T1" … "T20") and sends them. */
export const tableBatchSchema = z.object({
  branchId: z.string().optional(),
  names: z
    .array(z.string().trim().min(1).max(20))
    .min(1, 'Add at least one table')
    .max(100, 'Up to 100 tables at a time'),
  section: z.string().trim().max(30).default(''),
  seats: seatsField,
});

export default tableBatchSchema;
