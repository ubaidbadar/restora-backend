import { z } from 'zod';
import ORDER_STATUSES from '../constants/order_status';
import ORDER_TYPES from '../constants/order_types';
import PAYMENT_METHODS from '../constants/payment_methods';
import PAYMENT_STATUSES from '../constants/payment_statuses';

export const orderItemInputSchema = z.object({
  itemId: z.string().min(1, 'Item ID required'),
  sizeId: z.string().optional().nullable(),
  addonIds: z.array(z.string()).default([]),
  note: z.string().optional().nullable(),
  qty: z.coerce.number().int().min(1, 'Quantity must be at least 1'),
});

export const orderCreateSchema = z
  .object({
    branchId: z.string().optional(),
    customerId: z.string().optional().nullable(),
    newName: z.string().optional().nullable(),
    newPhone: z.string().optional().nullable(),
    items: z.array(orderItemInputSchema).min(1, 'Add at least one dish'),
    type: z.enum(ORDER_TYPES),
    tableId: z.string().optional().nullable(),
    tableName: z.string().optional().nullable(),
    area: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    rider: z.string().optional().nullable(),
    deliveryFee: z.coerce.number().min(0).default(0),
    discount: z.coerce.number().min(0).default(0),
    paymentMethod: z.preprocess((val) => val || undefined, z.enum(PAYMENT_METHODS).optional()),
    paymentStatus: z.enum(PAYMENT_STATUSES).default('unpaid'),
    clientId: z.string().trim().min(8).max(64).optional(),
    placedAt: z.iso.datetime().optional(),
    takenBy: z.string().optional(),
  })
  .superRefine((order, ctx) => {
    if (order.type === 'dine_in' && !order.tableId && !order.tableName) {
      ctx.addIssue({ code: 'custom', path: ['tableId'], message: 'Pick the table' });
    }
    if (order.type === 'delivery' && !order.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter the delivery address' });
    }
    if (order.paymentStatus !== 'unpaid' && !order.paymentMethod) {
      ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Pick how the customer paid' });
    }
    if (order.paymentStatus === 'khata' && !order.customerId && !order.newName) {
      ctx.addIssue({
        code: 'custom',
        path: ['paymentStatus'],
        message: 'Khata needs a customer. Pick one above first.',
      });
    }
  });

export const orderUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  rider: z.string().optional().nullable(),
  area: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  discount: z.coerce.number().min(0).optional(),
  deliveryFee: z.coerce.number().min(0).optional(),
  tableId: z.string().optional().nullable(),
  tableName: z.string().optional().nullable(),
  updatedBy: z.string().optional(),
  updatedAt: z.string().optional(),
});

/** Editing a placed order: what it is and what is in it. How it is paid is recorded from the board, not here. */
export const orderEditSchema = z
  .object({
    customerId: z.string().optional().nullable(),
    newName: z.string().optional().nullable(),
    newPhone: z.string().optional().nullable(),
    items: z.array(orderItemInputSchema).min(1, 'Add at least one dish'),
    type: z.enum(ORDER_TYPES),
    tableId: z.string().optional().nullable(),
    tableName: z.string().optional().nullable(),
    area: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    rider: z.string().optional().nullable(),
    deliveryFee: z.coerce.number().min(0).default(0),
    discount: z.coerce.number().min(0).default(0),
    editedBy: z.string().optional(),
    editedAt: z.string().optional(),
  })
  .superRefine((order, ctx) => {
    if (order.type === 'dine_in' && !order.tableId && !order.tableName) ctx.addIssue({ code: 'custom', path: ['tableId'], message: 'Pick the table' });
    if (order.type === 'delivery' && !order.address) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter the delivery address' });
  });

export default orderCreateSchema;
