import { useState } from 'react';
import api from '../../config/api';
import useCartStore from '../../store/cart_store';
import type CartLine from '../../types/cart_line';
import type TableOrder from '../../types/table_order';
import formatRs from '../../utils/format_rs';
import serviceChargeOf from '@shared/service_charge_of';
import type TableMenu from '../../types/table_menu';

/**
 * Sends the guest's cart to the kitchen's queue; staff accept it before it is cooked. `clientId` is made once per cart,
 * so a retry after a dropped connection gives the same order, not a second one. Prices are the API's, never the page's.
 */
export default function SendOrder({ code, lines, clientId, dineInServiceCharge, onOrderSent }: { code: string; lines: CartLine[]; clientId: string; dineInServiceCharge: TableMenu['dineInServiceCharge']; onOrderSent?: (order: TableOrder) => void }) {
  const [send, setSend] = useState({ sending: false, error: '' });
  const subtotal = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);
  const serviceCharge = serviceChargeOf('dine_in', subtotal, 0, dineInServiceCharge).serviceCharge;
  const total = subtotal + serviceCharge;

  const submit = () => {
    setSend({ sending: true, error: '' });
    const items = lines.map(({ itemId, sizeId, addonIds, note, qty }) => ({ itemId, sizeId, addonIds, note, qty }));
    api
      .post<TableOrder>(`/public/t/${code}/order`, { items, clientId })
      .then((res) => {
        navigator.vibrate?.([12, 60, 12]);
        useCartStore.getState().markSent(res.data.dailyToken);
        if (res.data._id) {
          onOrderSent?.(res.data);
        }
      })
      .catch((err) => setSend({ sending: false, error: err.message }));
  };

  return (
    <div className="flex flex-col gap-2.5">
      {send.error && (
        <p role="alert" className="rounded-control bg-haldi-soft px-3.5 py-2.5 text-[0.95rem] font-semibold">
          {send.error}
        </p>
      )}
      <button type="button" disabled={send.sending} onClick={submit} className="inline-flex min-h-14 items-center justify-between gap-3 rounded-control bg-indigo px-5 text-lg font-semibold text-white hover:bg-indigo-deep disabled:opacity-70">
        <span>{send.sending ? 'Sending…' : 'Send to the kitchen'}</span>
        <span className="tabular-nums">{formatRs(total)}</span>
      </button>
      {serviceCharge > 0 && <p className="text-center text-sm text-ink-2">Includes {formatRs(serviceCharge)} dine-in service charge. Tax, if any, is added on the bill.</p>}
      {serviceCharge === 0 && <p className="text-center text-sm text-ink-3">You pay at the end. Tax, if any, is added on the bill.</p>}
    </div>
  );
}
