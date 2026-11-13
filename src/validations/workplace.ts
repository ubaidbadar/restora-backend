import { z } from 'zod';

export const workplaceSchema = z.object({ restaurantId: z.string().min(1, 'Pick a restaurant') });

export const branchPickSchema = z.object({ branchId: z.string().min(1, 'Pick a branch') });

export const workspacePreferencesSchema = z.object({
  orders: z.object({
    sidebarHidden: z.boolean().optional(),
    detailsPanel: z.boolean().optional(),
    density: z.enum(['comfortable', 'compact']).optional(),
  }).partial().strict().optional(),
}).strict();

export default workplaceSchema;
