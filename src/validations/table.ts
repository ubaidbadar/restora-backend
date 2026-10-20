import { z } from 'zod';

export const tableSchema = z.object({
  branchId: z.string().optional(),
  name: z.string().trim().min(1, 'Enter the table name').max(20),
  section: z.string().trim().max(30).default(''),
  seats: z.union([z.string(), z.number()]).transform((val) => (String(val).trim() ? Number(val) : null)).pipe(z.number().int().min(1).max(100).nullable()).default(null),
});

export const tableUpdateSchema = z.object({
  branchId: z.string().optional(),
  name: z.string().trim().min(1, 'Enter the table name').max(20).optional(),
  section: z.string().trim().max(30).optional(),
  seats: z.union([z.string(), z.number()]).transform((val) => (String(val).trim() ? Number(val) : null)).pipe(z.number().int().min(1).max(100).nullable()).optional(),
  archived: z.boolean().optional(),
});

export default tableSchema;
