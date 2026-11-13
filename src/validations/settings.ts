import { z } from 'zod';
import PAYMENT_METHODS from '../constants/payment_methods';
import TEMPLATE_KEYS from '../constants/template_keys';

const percent = z.coerce.number().min(0, 'Cannot be below 0').max(100, 'Cannot be above 100');

const taxByPaymentMethodSchema = z.object({
  cash: percent,
  card: percent,
  jazzcash: percent,
  easypaisa: percent,
  bank: percent,
});

const dineInServiceChargeSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['percentage', 'fixed']),
  value: z.coerce.number().min(0, 'Cannot be below 0').max(1_000_000, 'Amount is too high'),
  taxable: z.boolean(),
}).superRefine((charge, ctx) => {
  if (charge.enabled && charge.value <= 0) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Enter an amount greater than 0, or turn the charge off' });
  }
  if (charge.type === 'percentage' && charge.value > 100) {
    ctx.addIssue({ code: 'custom', path: ['value'], message: 'Percentage cannot be above 100' });
  }
});

const whatsappTemplatesSchema = z.object({
  winback: z.string().trim(),
  reservation: z.string().trim(),
});

const receiptSchema = z.object({
  ntn: z.string().trim().max(30, 'Up to 30 characters'),
  strn: z.string().trim().max(30, 'Up to 30 characters'),
  footer: z.string().trim().max(160, 'Keep it to 160 characters'),
});

/** The themes a restaurant can pick; each has a light and a dark side (the colours live in the web app). */
const appearanceSchema = z.object({
  theme: z.enum(['indigo', 'saffron', 'emerald', 'ocean', 'bordeaux', 'onyx']),
  mode: z.enum(['light', 'dark', 'system']),
  sidebar: z.enum(['theme', 'plain']),
});

export const settingsSchema = z.object({
  restaurantName: z.string().trim().min(1, 'Enter the restaurant name'),
  logo: z.string().optional().nullable(),
  taxByPaymentMethod: taxByPaymentMethodSchema,
  dineInServiceCharge: dineInServiceChargeSchema.optional(),
  whatsappTemplates: whatsappTemplatesSchema,
  receipt: receiptSchema.partial().optional(),
  appearance: appearanceSchema.partial().optional(),
});

/** `taxSet` and other read-only fields the client echoes back are ignored; saving any tax rate marks tax as set. */
export const settingsUpdateSchema = z.object({
  restaurantName: z.string().trim().min(1, 'Enter the restaurant name').optional(),
  logo: z.string().optional().nullable(),
  taxByPaymentMethod: taxByPaymentMethodSchema.partial().optional(),
  dineInServiceCharge: dineInServiceChargeSchema.optional(),
  whatsappTemplates: whatsappTemplatesSchema.partial().optional(),
  receipt: receiptSchema.partial().optional(),
  appearance: appearanceSchema.partial().optional(),
});

export default settingsSchema;
