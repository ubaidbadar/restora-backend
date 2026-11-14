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
    serviceChargeType: z.enum(['percentage', 'fixed']).nullish(),
    serviceChargeValue: z.coerce.number().finite().min(0).optional(),
    discount: z.coerce.number().min(0).default(0),
    paymentMethod: z.preprocess((val) => val || undefined, z.enum(PAYMENT_METHODS).optional()),
    paymentStatus: z.enum(PAYMENT_STATUSES).default('unpaid'),
    clientId: z.string().trim().min(8).max(64).optional(),
    placedAt: z.iso.datetime().optional(),
  })
  .superRefine((order, ctx) => {
    if (order.type === 'dine_in' && !order.tableId && !order.tableName) {
      ctx.addIssue({ code: 'custom', path: ['tableId'], message: 'Pick the table' });
    }
    if (order.type === 'delivery' && !order.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter the delivery address' });
    }
    if (order.type !== 'dine_in' && (order.serviceChargeValue ?? 0) > 0) {
      ctx.addIssue({ code: 'custom', path: ['serviceChargeValue'], message: 'Service charges apply to dine-in only' });
    }
    if ((order.serviceChargeValue ?? 0) > 0 && !order.serviceChargeType) {
      ctx.addIssue({ code: 'custom', path: ['serviceChargeType'], message: 'Pick percent or fixed service charge' });
    }
    if (order.serviceChargeType === 'percentage' && (order.serviceChargeValue ?? 0) > 100) {
      ctx.addIssue({ code: 'custom', path: ['serviceChargeValue'], message: 'Percentage cannot exceed 100' });
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
    serviceChargeType: z.enum(['percentage', 'fixed']).nullish(),
    serviceChargeValue: z.coerce.number().finite().min(0).optional(),
    discount: z.coerce.number().min(0).default(0),
  })
  .superRefine((order, ctx) => {
    if (order.type === 'dine_in' && !order.tableId && !order.tableName) ctx.addIssue({ code: 'custom', path: ['tableId'], message: 'Pick the table' });
    if (order.type === 'delivery' && !order.address) ctx.addIssue({ code: 'custom', path: ['address'], message: 'Enter the delivery address' });
    if (order.type !== 'dine_in' && (order.serviceChargeValue ?? 0) > 0) {
      ctx.addIssue({ code: 'custom', path: ['serviceChargeValue'], message: 'Service charges apply to dine-in only' });
    }
    if ((order.serviceChargeValue ?? 0) > 0 && !order.serviceChargeType) {
      ctx.addIssue({ code: 'custom', path: ['serviceChargeType'], message: 'Pick percent or fixed service charge' });
    }
    if (order.serviceChargeType === 'percentage' && (order.serviceChargeValue ?? 0) > 100) {
      ctx.addIssue({ code: 'custom', path: ['serviceChargeValue'], message: 'Percentage cannot exceed 100' });
    }
  });

export default orderCreateSchema;
