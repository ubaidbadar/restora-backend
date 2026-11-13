/** One of the table's orders, shown live to guests as the kitchen and staff move it on. */
export default interface TableOrder {
  _id: string;
  dailyToken: number;
  status: 'pending' | 'new' | 'preparing' | 'ready' | 'completed' | 'cancelled' | 'out_for_delivery';
  paymentStatus: 'unpaid' | 'paid' | 'khata';
  items: {
    name: string;
    qty: number;
    price: number;
    sizeName?: string;
    addonNames?: string[];
    note?: string;
  }[];
  total: number;
  serviceCharge?: number;
  createdAt: string;
}
