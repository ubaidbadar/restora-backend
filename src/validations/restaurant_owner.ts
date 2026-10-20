import { z } from 'zod';

export const transferOwnershipSchema = z.object({
  membershipId: z.string().min(1, 'Pick who gets the restaurant'),
  confirmName: z.string().trim().min(1, 'Type the restaurant name'),
  keepMeAsOwner: z.boolean().default(true),
});

export const deleteRestaurantSchema = z.object({
  confirmName: z.string().trim().min(1, 'Type the restaurant name'),
});

export const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
});

export default transferOwnershipSchema;
