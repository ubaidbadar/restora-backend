import { useState } from 'react';
import { BellRing, ReceiptText } from 'lucide-react';
import api from '../../config/api';

type Kind = 'waiter' | 'bill';

/**
 * Calling a waiter to the table, or asking for the bill. Tapping again while one is open does not call twice. What the
 * staff answered replaces the buttons until the guest closes it.
 */
export default function CallButtons({ code, sentNote }: { code: string; sentNote: string }) {
  const [call, setCall] = useState<{ calling?: Kind; status?: { ok: boolean; message: string } }>({});

  const send = (kind: Kind) => {
    setCall({ calling: kind });
    api
      .post(`/public/t/${code}/call`, { kind })
      .then(() => setCall({ status: { ok: true, message: kind === 'waiter' ? 'A waiter is on the way.' : 'Your bill is on the way.' } }))
      .catch((err) => setCall({ status: { ok: false, message: err.status === 404 ? err.message : 'We could not reach the staff. Please wave to a waiter.' } }));
  };

  if (call.status) {
    return (
      <div role="status" className={`flex min-h-12 items-center justify-between gap-3 rounded-full ps-5 pe-2 ${call.status.ok ? 'bg-leaf-soft text-leaf' : 'bg-haldi-soft text-ink'}`}>
        <p className="font-semibold">{call.status.message}</p>
        <button type="button" onClick={() => setCall({})} className="min-h-10 rounded-full px-4 font-semibold hover:bg-ink/5">
          OK
        </button>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 gap-2.5">
        <CallButton icon={BellRing} label="Call waiter" busy={call.calling === 'waiter'} disabled={Boolean(call.calling)} onClick={() => send('waiter')} />
        <CallButton icon={ReceiptText} label="Ask for bill" busy={call.calling === 'bill'} disabled={Boolean(call.calling)} onClick={() => send('bill')} />
      </div>
      {sentNote && <p className="text-center text-sm text-ink-3">{sentNote}</p>}
    </>
  );
}

function CallButton({ icon: Icon, label, busy, disabled, onClick }: { icon: typeof BellRing; label: string; busy: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-canvas font-semibold text-ink ring-1 ring-rule transition-colors hover:bg-indigo-wash hover:ring-indigo/30 disabled:opacity-60"
    >
      <Icon aria-hidden="true" className={`size-5 text-indigo ${busy ? 'animate-pulse' : ''}`} />
      {busy ? 'Calling…' : label}
    </button>
  );
}
