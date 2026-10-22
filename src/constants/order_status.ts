/** `pending`: a guest sent it from the table's QR page and staff have not accepted it yet. */
const ORDER_STATUSES = ['pending', 'new', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export default ORDER_STATUSES;
