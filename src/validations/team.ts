import { z } from 'zod';

export const teamSchema = z.object({
  name: z.string().trim().min(1, 'Enter the team name').max(60),
  description: z.string().trim().optional().nullable(),
  branchId: z
    .string()
    .optional()
    .nullable()
    .transform((val) => val || null),
  membershipIds: z.array(z.string()).default([]),
});

export const teamUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Enter the team name').max(60).optional(),
  description: z.string().trim().optional().nullable(),
  // Only when sent: '' or null means "all branches"; missing leaves it as it is.
  branchId: z
    .string()
    .nullable()
    .transform((val) => val || null)
    .optional(),
  membershipIds: z.array(z.string()).optional(),
});

export default teamSchema;
