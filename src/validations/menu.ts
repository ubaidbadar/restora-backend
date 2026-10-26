import { z } from 'zod';

export const menuSizeSchema = z.object({
  _id: z.string().optional(),
  name: z.string().default(''),
  price: z.coerce.number().min(0, 'Price must be 0 or more'),
});

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const time = z.union([z.literal(''), z.string().regex(HHMM, 'Use a time like 12:00')]);
/** Both hours or neither: a deal is sold from one time to another, or all day. */
const bothHours = (item: { from?: string; to?: string }) => (!item.from && !item.to) || (!!item.from && !!item.to && item.from !== item.to);
const hoursIssue = { error: 'Enter both times, or neither for all day', path: ['to'] };

/** A dish in a deal; the dish's first size when none is picked. */
export const dealPartSchema = z.object({
  itemId: z.string().min(1, 'Pick a dish'),
  sizeId: z.string().nullish().transform((v) => v || undefined),
  qty: z.coerce.number().int().min(1).max(20),
});

const dealFields = {
  includes: z.array(dealPartSchema).max(20),
  days: z
    .array(z.number().int().min(0).max(6))
    .max(7)
    .transform((days) => [...new Set(days)].sort()),
  from: time,
  to: time,
};

export const menuItemSchema = z.object({
  categoryId: z.string().min(1, 'Pick a category'),
  name: z.string().trim().min(1, 'Enter the dish name').max(80),
  description: z.string().trim().max(200).optional().default(''),
  photo: z.string().optional().nullable(),
  sizes: z
    .array(menuSizeSchema)
    .min(1, 'Add at least one price')
    .transform((sizes) => (sizes.length === 1 ? [{ ...sizes[0]!, name: '' }] : sizes)),
  addonGroupIds: z.array(z.string()).default([]),
  includes: dealFields.includes.default([]),
  days: dealFields.days.default([]),
  from: dealFields.from.default(''),
  to: dealFields.to.default(''),
  hidden: z.boolean().default(false),
}).refine(bothHours, hoursIssue);

/** Editing a dish changes only the fields sent: no defaults, so a rename does not clear add-ons or unhide it. */
export const menuItemUpdateSchema = z.object({
  categoryId: z.string().min(1, 'Pick a category').optional(),
  name: z.string().trim().min(1, 'Enter the dish name').max(80).optional(),
  description: z.string().trim().max(200).optional(),
  photo: z.string().optional().nullable(),
  sizes: z
    .array(menuSizeSchema)
    .min(1, 'Add at least one price')
    .transform((sizes) => (sizes.length === 1 ? [{ ...sizes[0]!, name: '' }] : sizes))
    .optional(),
  addonGroupIds: z.array(z.string()).optional(),
  includes: dealFields.includes.optional(),
  days: dealFields.days.optional(),
  from: dealFields.from.optional(),
  to: dealFields.to.optional(),
  hidden: z.boolean().optional(),
}).refine(bothHours, hoursIssue);

export const menuCategorySchema = z.object({
  name: z.string().trim().min(1, 'Enter the category name').max(40),
  sortOrder: z.coerce.number().int().default(0),
});

export const menuCategoryUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Enter the category name').max(40).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

export const addonOptionSchema = z.object({
  _id: z.string().optional(),
  name: z.string().trim().min(1, 'Enter option name'),
  price: z.coerce.number().min(0).default(0),
});

const addonGroupFields = z.object({
  name: z.string().trim().min(1, 'Enter group name'),
  min: z.coerce.number().int().min(0).default(0),
  max: z.coerce.number().int().min(1).default(1),
  options: z.array(addonOptionSchema).min(1, 'Add at least one option'),
});

/** `min` can never be more than `max` or than the options there are, or the group could never be satisfied. */
export const addonGroupSchema = addonGroupFields.refine((g) => g.min <= g.max && g.min <= g.options.length, {
  error: 'Pick at most as many as the most allowed and the options there are',
  path: ['min'],
});

export const addonGroupUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Enter group name').optional(),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(1).optional(),
  options: z.array(addonOptionSchema).min(1, 'Add at least one option').optional(),
});

export const stockToggleSchema = z.object({
  soldOut: z.boolean(),
  branchId: z.string().optional(),
});

export const bulkMenuSchema = z.object({
  addonGroups: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(60),
        min: z.number().int().min(0).default(0),
        max: z.number().int().min(1).default(1),
        options: z.array(z.object({ name: z.string().trim().min(1).max(60), price: z.number().min(0).default(0) })).min(1).max(50),
      })
    )
    .max(100)
    .default([]),
  items: z
    .array(
      z.object({
        category: z.string().trim().min(1).max(40),
        name: z.string().trim().min(1).max(80),
        sizes: z.array(z.object({ name: z.string().default(''), price: z.number().min(0) })).min(1).max(10),
        addons: z.array(z.string()).default([]),
      })
    )
    .max(1000)
    .default([]),
});

export default menuItemSchema;
