/** Why an order was cancelled (or a guest's order turned down). `other` needs a note. */
const CANCEL_REASONS = ['customer_left', 'wrong_order', 'out_of_stock', 'duplicate', 'other'] as const;

export type CancelReason = (typeof CANCEL_REASONS)[number];

export default CANCEL_REASONS;
