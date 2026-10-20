const PAYMENT_STATUSES = ['paid', 'unpaid', 'khata'] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export default PAYMENT_STATUSES;
