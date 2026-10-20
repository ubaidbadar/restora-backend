import { z } from 'zod';

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Enter the restaurant name').max(80),
  branchName: z.string().trim().min(1, 'Enter the branch name').max(60),
  area: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
});

export default onboardingSchema;
