import { z } from 'zod';

const seatsField = z
  .union([z.string(), z.number(), z.null()])
  .optional()
  .transform((val) => (val === null || val === undefined || !String(val).trim() ? null : Number(val)))
  .pipe(z.number().int().min(1).max(100).nullable())
  .optional();

export const tableSchema = z.object({
  branchId: z.string().optional(),
  name: z.string().trim().min(1, 'Enter the table name').max(20),
  section: z.string().trim().max(30).default(''),
  seats: seatsField,
});

export const tableUpdateSchema = z.object({
  branchId: z.string().optional(),
  name: z.string().trim().min(1, 'Enter the table name').max(20).optional(),
  section: z.string().trim().max(30).optional(),
  seats: seatsField,
  archived: z.boolean().optional(),
});

export default tableSchema;
