const PAYMENT_METHODS = ['cash', 'card', 'jazzcash', 'easypaisa', 'bank'] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export default PAYMENT_METHODS;
