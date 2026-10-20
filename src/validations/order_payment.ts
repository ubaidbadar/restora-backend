import { z } from 'zod';
import PAYMENT_METHODS from '../constants/payment_methods';

export const orderPaymentSchema = z.object({
  paymentMethod: z.enum(PAYMENT_METHODS),
  paymentStatus: z.enum(['paid', 'khata']).default('paid'),
  discount: z.coerce.number().min(0).optional(),
  deliveryFee: z.coerce.number().min(0).optional(),
});

export default orderPaymentSchema;
