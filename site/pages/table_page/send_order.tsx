import { useState } from 'react';
import api from '../../config/api';
import useCartStore from '../../store/cart_store';
import type CartLine from '../../types/cart_line';
import formatRs from '../../utils/format_rs';

/**
 * Sends the guest's cart to the kitchen's queue; staff accept it before it is cooked. `clientId` is made once per cart,
 * so a retry after a dropped connection gives the same order, not a second one. Prices are the API's, never the page's.
 */
export default function SendOrder({ code, lines, clientId }: { code: string; lines: CartLine[]; clientId: string }) {
  const [send, setSend] = useState({ sending: false, error: '' });
  const total = lines.reduce((sum, line) => sum + line.unitPrice * line.qty, 0);

  const submit = () => {
    setSend({ sending: true, error: '' });
    const items = lines.map(({ itemId, sizeId, addonIds, note, qty }) => ({ itemId, sizeId, addonIds, note, qty }));
    api
      .post<{ dailyToken: number }>(`/public/t/${code}/order`, { items, clientId })
      .then((res) => {
        navigator.vibrate?.([12, 60, 12]);
        useCartStore.getState().markSent(res.data.dailyToken);
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
      <p className="text-center text-sm text-ink-3">You pay at the end. Tax, if any, is added on the bill.</p>
    </div>
  );
}
