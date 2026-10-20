import { z } from 'zod';

export const deviceRegisterSchema = z.object({
  name: z.string().trim().min(1, 'Name this terminal, e.g. Counter 1').max(40),
  branchId: z.string().optional(),
  idleLockSeconds: z.coerce.number().int().min(30, 'At least 30 seconds').max(3600, 'At most an hour').default(90),
  lockAfterOrder: z.boolean().default(false),
});

export const deviceUpdateSchema = z.object({
  name: z.string().trim().min(1).max(40).optional(),
  branchId: z.string().min(1).optional(),
  idleLockSeconds: z.coerce.number().int().min(30).max(3600).optional(),
  lockAfterOrder: z.boolean().optional(),
});

export default deviceRegisterSchema;
