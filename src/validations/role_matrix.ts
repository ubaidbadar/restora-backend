import { z } from 'zod';
import PERMISSION_CATALOG from '@shared/permission_catalog';

const validPermissions = PERMISSION_CATALOG.map((p) => p.permission) as [string, ...string[]];

/** `p` maps `r<roleId>` to that role's permissions, as the Roles matrix form sends it. */
export const roleMatrixSchema = z.object({
  p: z.record(z.string(), z.array(z.enum(validPermissions))).default({}),
});

export default roleMatrixSchema;
