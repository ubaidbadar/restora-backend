export interface LineItem {
  price: number;
  qty: number;
}

export interface Totals {
  subtotal: number;
  discount: number;
  tax: number;
  serviceCharge: number;
  total: number;
}

/** Tax and a percentage service charge use the discounted dish subtotal; fees are not included in the tax base. */
export default function calcTotals(
  items: LineItem[], discount: number, taxRate: number, deliveryFee = 0,
  serviceChargeType?: 'percentage' | 'fixed', serviceChargeValue = 0,
): Totals {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.qty, 0);
  const applied = Math.min(Math.max(0, discount), subtotal);
  const net = subtotal - applied;
  const tax = Math.round((net * taxRate) / 100);
  const serviceCharge = serviceChargeType === 'percentage'
    ? Math.round(net * serviceChargeValue / 100)
    : serviceChargeType === 'fixed' ? Math.round(serviceChargeValue) : 0;
  return { subtotal, discount: applied, tax, serviceCharge, total: net + tax + deliveryFee + serviceCharge };
}
