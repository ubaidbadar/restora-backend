import { z } from 'zod';
import RESERVATION_STATUSES from '../constants/reservation_status';
import { phoneSchema } from './customer';

const dateTime = z.iso.datetime({ offset: true, error: 'Pick a date and time' });
/** '' from the client's table picker means no table. */
const tableId = z
  .string()
  .nullable()
  .optional()
  .transform((val) => val || null);

/** A new booking: a saved customer, or the guest's name and mobile (saved as a customer if new). */
export const reservationCreateSchema = z
  .object({
    branchId: z.string().optional(),
    customerId: z.string().optional().nullable(),
    name: z.string().trim().max(80).optional().nullable(),
    phone: phoneSchema.optional(),
    // Older field names, still accepted.
    newName: z.string().trim().max(80).optional().nullable(),
    newPhone: phoneSchema.optional(),
    partySize: z.coerce.number().int().min(1, 'Party size must be at least 1').max(500),
    dateTime,
    status: z.enum(RESERVATION_STATUSES).default('pending'),
    tableId,
    note: z.string().trim().max(300).optional().nullable(),
  })
  .transform(({ name, phone, newName, newPhone, ...rest }) => ({ ...rest, guestName: name || newName || undefined, guestPhone: phone || newPhone }))
  .refine((r) => r.customerId || (r.guestName && r.guestPhone), { error: 'Enter the guest name and mobile number', path: ['phone'] });

export const reservationUpdateSchema = z.object({
  partySize: z.coerce.number().int().min(1).max(500).optional(),
  dateTime: dateTime.optional(),
  status: z.enum(RESERVATION_STATUSES).optional(),
  tableId,
  note: z.string().trim().max(300).optional().nullable(),
});

export default reservationCreateSchema;
