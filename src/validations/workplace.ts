import { z } from 'zod';

export const workplaceSchema = z.object({ restaurantId: z.string().min(1, 'Pick a restaurant') });

export const branchPickSchema = z.object({ branchId: z.string().min(1, 'Pick a branch') });

export default workplaceSchema;
