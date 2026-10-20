import { z } from 'zod';

export const branchSchema = z.object({
  name: z.string().trim().min(1, 'Enter the branch name').max(60),
  address: z.string().trim().optional().nullable(),
  area: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
});

export default branchSchema;
