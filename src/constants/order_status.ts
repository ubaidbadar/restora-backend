const ORDER_STATUSES = ['new', 'preparing', 'ready', 'out_for_delivery', 'completed', 'cancelled'] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export default ORDER_STATUSES;
