const ORDER_TYPES = ['dine_in', 'takeaway', 'delivery'] as const;

export type OrderType = (typeof ORDER_TYPES)[number];

export default ORDER_TYPES;
