import { z } from 'zod';
import ORDER_STATUSES from '../constants/order_status';

export const orderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  updatedBy: z.string().optional(),
  updatedAt: z.string().optional(),
});

export default orderStatusSchema;
