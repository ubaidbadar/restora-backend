import { z } from 'zod';
import PIN_PATTERN from '../constants/pin_pattern';
import normalizePhone from '../utils/normalize_phone';
import { isWeakPin } from '../utils/validate_pin';

export const pinValidationSchema = z.object({
  pin: z
    .string()
    .regex(PIN_PATTERN, 'Use 4 to 6 digits')
    .refine((value) => !isWeakPin(value), 'Pick a PIN harder to guess than 1234 or 0000'),
});

export const inviteValidationSchema = z
  .object({
    channel: z.enum(['email', 'phone']),
    email: z.string().trim().optional(),
    phone: z.string().trim().optional(),
    name: z.string().trim().optional().nullable(),
    roleIds: z.array(z.string()).min(1, 'Pick at least one role'),
    branchScope: z.enum(['all', 'list']).default('all'),
    branchIds: z.array(z.string()).default([]),
  })
  .superRefine((val, ctx) => {
    if (val.channel === 'email') {
      if (!val.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.email)) {
        ctx.addIssue({ code: 'custom', path: ['email'], message: 'Enter an email like name@example.com' });
      }
    }
    if (val.channel === 'phone') {
      if (!val.phone || !normalizePhone(val.phone)) {
        ctx.addIssue({ code: 'custom', path: ['phone'], message: 'Enter a mobile number like 0300 1234567' });
      }
    }
    if (val.branchScope === 'list' && (!val.branchIds || val.branchIds.length === 0)) {
      ctx.addIssue({ code: 'custom', path: ['branchIds'], message: 'Pick at least one branch' });
    }
  });

export const accessValidationSchema = z
  .object({
    roleIds: z.array(z.string()).min(1, 'Pick at least one role'),
    branchScope: z.enum(['all', 'list']),
    branchIds: z.array(z.string()).default([]),
  })
  .superRefine((val, ctx) => {
    if (val.branchScope === 'list' && (!val.branchIds || val.branchIds.length === 0)) {
      ctx.addIssue({ code: 'custom', path: ['branchIds'], message: 'Pick at least one branch' });
    }
  });

export default inviteValidationSchema;
