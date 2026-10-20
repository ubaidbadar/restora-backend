import { z } from 'zod';
import PERMISSION_CATALOG from '@shared/permission_catalog';

const validPermissions = PERMISSION_CATALOG.map((p) => p.permission);

export const roleSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name for the role').max(40),
  description: z.string().trim().optional().nullable(),
  permissions: z
    .array(z.string())
    .refine((perms) => perms.every((p) => validPermissions.includes(p as (typeof validPermissions)[number])), {
      error: 'Invalid permission specified',
    })
    .default([]),
});

export const roleUpdateSchema = z.object({
  name: z.string().trim().min(1, 'Enter a name for the role').max(40).optional(),
  description: z.string().trim().optional().nullable(),
  permissions: z
    .array(z.string())
    .refine((perms) => perms.every((p) => validPermissions.includes(p as (typeof validPermissions)[number])), {
      error: 'Invalid permission specified',
    })
    .optional(),
});

export default roleSchema;
