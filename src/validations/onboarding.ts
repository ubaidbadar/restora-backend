import { z } from 'zod';

export const onboardingSchema = z.object({
  name: z.string().trim().min(1, 'Enter the restaurant name').max(80),
  branchName: z.string().trim().min(1, 'Enter the branch name').max(60),
  area: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  /** A data URL from the logo picker, uploaded to storage. */
  logo: z.string().startsWith('data:image/', 'Pick an image for the logo').optional().nullable(),
});

export default onboardingSchema;
