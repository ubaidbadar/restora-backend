import { z } from 'zod';
import normalizePhone from '../utils/normalize_phone';

export const phoneSchema = z
  .string()
  .refine((val) => normalizePhone(val) !== null, {
    error: 'Enter a mobile number like 0300 1234567',
  })
  .transform((val) => normalizePhone(val)!);

export const altPhoneSchema = z
  .string()
  .optional()
  .nullable()
  // A mobile is saved like the main number (+923…), so searches and merges find it; anything else as typed.
  .transform((val) => (val?.trim() ? (normalizePhone(val) ?? val.trim()) : undefined));

export const stringListSchema = z
  .union([z.array(z.string()), z.string()])
  .optional()
  .transform((val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val.map((s) => s.trim()).filter(Boolean);
    return val.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);
  });

export const customerCreateSchema = z.object({
  name: z.string().trim().min(1, 'Enter the customer name'),
  phone: phoneSchema,
  altPhone: altPhoneSchema,
  area: z.string().trim().optional(),
  tags: stringListSchema.default([]),
  addresses: stringListSchema.default([]),
  notes: z.string().trim().optional(),
  openingKhata: z.coerce.number().finite().optional().default(0),
});

export const customerUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Enter the customer name').optional(),
  phone: phoneSchema.optional(),
  altPhone: altPhoneSchema,
  area: z.string().trim().optional(),
  tags: stringListSchema.optional(),
  addresses: stringListSchema.optional(),
  notes: z.string().trim().optional(),
});

export default customerCreateSchema;

/** Merging another customer into this one. */
export const customerMergeSchema = z.object({ customerId: z.string().min(1, 'Pick the customer to merge') });
