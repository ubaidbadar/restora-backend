import { CircleCheck } from 'lucide-react';
import withOverlay from '../../hoc/withOverlay';
import useCartStore from '../../store/cart_store';
import type ShowTools from '../../types/show_tools';
import type TableOrder from '../../types/table_order';
import type TableMenu from '../../types/table_menu';
import serviceChargeOf from '@shared/service_charge_of';
import BottomSheet from '../../ui/bottom_sheet';
import formatRs from '../../utils/format_rs';
import SendOrder from './send_order';
import Stepper from './stepper';

interface CartSheetProps extends ShowTools {
  onOrderSent?: (order: TableOrder) => void;
  dineInServiceCharge: TableMenu['dineInServiceCharge'];
}

/**
 * The cart: each line with its choices and how many, the total, and sending it. Once sent it shows the order's number,
 * so the guest can tell the waiter; the waiter confirms it before the kitchen starts.
 */
function CartSheet({ close, onOrderSent, dineInServiceCharge }: CartSheetProps) {
  const cart = useCartStore();
  const subtotal = cart.lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const serviceCharge = serviceChargeOf('dine_in', subtotal, 0, dineInServiceCharge);

  if (cart.justSent !== null) {
    return (
      <BottomSheet title="Order sent" onClose={close} footer={<CloseButton onClose={close} label="Back to the menu" />}>
        <div className="flex flex-col items-center py-6 text-center">
          <CircleCheck aria-hidden="true" className="size-14 text-leaf" />
          <p className="mt-4 font-slip text-ink-3">Your order</p>
          <p className="display mt-1 text-[4rem] tabular-nums">#{cart.justSent}</p>
          <p role="status" className="mt-3 max-w-xs text-ink-2">
            Sent. A waiter will confirm it in a moment, then the kitchen starts. Want something else? Add it and send again.
          </p>
        </div>
      </BottomSheet>
    );
  }

  if (cart.lines.length === 0) {
    return (
      <BottomSheet title="Your order" onClose={close} footer={<CloseButton onClose={close} label="Back to the menu" />}>
        <p className="py-8 text-center text-ink-2">Nothing here yet. Tap Add on a dish.</p>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title="Your order" onClose={close} footer={<SendOrder code={cart.code} lines={cart.lines} clientId={cart.clientId} dineInServiceCharge={dineInServiceCharge} onOrderSent={onOrderSent} />}>
      <ul className="flex flex-col divide-y divide-rule">
        {cart.lines.map((line) => {
          const details = [line.sizeName, ...line.addonNames].filter(Boolean).join(', ');
          return (
            <li key={line.key} className="flex items-center gap-3 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{line.name}</p>
                {details && <p className="text-sm text-ink-2">{details}</p>}
                {line.note && <p className="text-sm italic text-ink-3">“{line.note}”</p>}
                <p className="mt-1 text-sm font-semibold tabular-nums">{formatRs(line.unitPrice * line.qty)}</p>
              </div>
              <Stepper label={line.name} qty={line.qty} onChange={(qty) => cart.setQty(line.key, qty)} />
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-1.5 border-t border-rule pt-3 text-sm">
        <div className="flex justify-between"><span className="text-ink-2">Subtotal</span><span className="tabular-nums">{formatRs(subtotal)}</span></div>
        {serviceCharge.serviceCharge > 0 && <div className="flex justify-between"><span className="text-ink-2">Service charge</span><span className="tabular-nums">{formatRs(serviceCharge.serviceCharge)}</span></div>}
        <div className="flex justify-between text-base font-bold"><span>Total before tax</span><span className="tabular-nums">{formatRs(subtotal + serviceCharge.serviceCharge)}</span></div>
      </div>
    </BottomSheet>
  );
}

function CloseButton({ onClose, label }: { onClose: () => void; label: string }) {
  return (
    <button type="button" onClick={onClose} className="inline-flex min-h-12 w-full items-center justify-center rounded-control border-2 border-ink font-semibold hover:bg-ink hover:text-white">
      {label}
    </button>
  );
}

export default withOverlay(CartSheet);
