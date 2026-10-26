import { ShoppingBag } from 'lucide-react';
import useCartStore from '../../store/cart_store';
import type TableOrder from '../../types/table_order';
import formatRs from '../../utils/format_rs';
import CallButtons from './call_buttons';
import CartSheet from './cart_sheet';

interface CartBarProps {
  code: string;
  tableName: string;
  orders?: TableOrder[];
  onOrderSent?: (order: TableOrder) => void;
}

/**
 * Always in reach at the bottom: the order so far (opens the cart), and calling a waiter or asking for the bill. Kept
 * clear of the screen's rounded corners and the home indicator (safe-area insets, see the viewport's viewport-fit=cover).
 */
export default function CartBar({ code, tableName, orders = [], onOrderSent }: CartBarProps) {
  const cart = useCartStore();
  const count = cart.lines.reduce((sum, line) => sum + line.qty, 0);
  const total = cart.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);

  const sentNote =
    orders.length > 0
      ? `Table ${tableName} orders: ${orders.map((o) => `#${o.dailyToken}`).join(', ')}`
      : cart.sent.length > 0 && count === 0
        ? `Sent from table ${tableName}: ${cart.sent.map((order) => `#${order.token}`).join(', ')}. Your waiter confirms each one.`
        : '';

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-rule bg-paper/95 ps-[max(1rem,env(safe-area-inset-left))] pe-[max(1rem,env(safe-area-inset-right))] pt-3 pb-[max(1.25rem,calc(env(safe-area-inset-bottom)+0.5rem))] shadow-[0_-12px_30px_-18px_rgb(18_21_46/0.35)] backdrop-blur">
      <div className="mx-auto flex max-w-xl flex-col gap-2.5">
        {/* Always mounted, so the sheet stays open to show the order's number once the cart is empty. */}
        <CartSheet
          onOrderSent={onOrderSent}
          component={({ open }) =>
            count > 0 && (
              <button type="button" onClick={open} className="flex min-h-14 items-center gap-3 rounded-full bg-indigo ps-5 pe-6 text-white hover:bg-indigo-deep">
                <span className="relative">
                  <ShoppingBag aria-hidden="true" className="size-6" />
                  <span className="absolute -top-1.5 -end-2 grid min-w-5 place-items-center rounded-full bg-haldi px-1 text-xs font-bold tabular-nums text-ink">{count}</span>
                </span>
                <span className="flex-1 text-start font-semibold">View your order</span>
                <span className="font-semibold tabular-nums">{formatRs(total)}</span>
              </button>
            )
          }
        />
        <CallButtons code={code} sentNote={count === 0 ? sentNote : ''} />
      </div>
    </div>
  );
}
