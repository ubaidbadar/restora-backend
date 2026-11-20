import { z } from 'zod';

export const printAgentCreateSchema = z.object({
  name: z.string().trim().min(1, 'Name the PC, e.g. Counter PC').max(40),
});

export const printerUpdateSchema = z.object({
  label: z.string().trim().min(1, 'Name this printer, e.g. Kitchen').max(30),
  prints: z.array(z.enum(['kitchen', 'receipt'])).default([]),
  categoryIds: z.array(z.string()).default([]),
  width: z.union([z.literal(48), z.literal(32)]),
  copies: z.coerce.number().int().min(1).max(5),
});

/** What the agent sends: the printers Windows lists, and its version. */
export const printersReportSchema = z.object({
  version: z.string().max(20).optional(),
  printers: z.array(z.string().min(1).max(200)).max(50),
  defaultPrinter: z.string().min(1).max(200).optional(),
});

export const agentPairSchema = printersReportSchema.extend({
  code: z.string().regex(/^\d{6}$/, 'The code is 6 digits'),
});

export const printJobResultSchema = z.object({
  status: z.enum(['printed', 'failed']),
  error: z.string().max(300).optional(),
});

export const printJobCreateSchema = z.object({
  orderId: z.string().min(1),
  kind: z.enum(['kitchen', 'receipt']),
});
