import { CheckCircle2, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

const DISHES = [
  { name: 'Seekh Kabab (4 pcs)', price: 'Rs 680', tap: 0.4 },
  { name: 'Chicken Tikka', price: 'Rs 420', tap: 0.9 },
  { name: 'Roghni Naan', price: 'Rs 60', tap: undefined },
];

/** A dish's + once tapped becomes how many, as on the real menu. */
function AddOrCount({ tap }: { tap?: number }) {
  return (
    <span className="grid">
      <span className="[grid-area:1/1] grid size-9 place-items-center justify-self-end rounded-full bg-indigo-wash text-indigo">
        <span className={tap === undefined ? '' : 'motion-safe:tour-hide motion-reduce:hidden'} style={tap === undefined ? undefined : tourAt(tap)}>
          <Plus className="size-4" strokeWidth={2.5} />
        </span>
      </span>
      {tap !== undefined && (
        <span className="[grid-area:1/1] flex h-9 items-center gap-2 rounded-full bg-indigo-wash px-2.5 text-indigo motion-safe:tour-pop" style={tourAt(tap)}>
          <Trash2 className="size-3.5" />
          <span className="text-[0.75rem] font-bold text-ink">1</span>
          <Plus className="size-3.5" strokeWidth={2.5} />
        </span>
      )}
    </span>
  );
}

/**
 * Step 2, on the guest's phone, as the real table menu: two dishes in, View your order, Send to the kitchen, and the
 * order's number. The waiter confirms it next.
 */
export default function MenuScene() {
  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <div className="bg-night pb-4 text-white">
        <StatusBar time="7:03" light />
        <div className="px-4">
          <p className="display text-[1.35rem]">Lahori Karahi House</p>
          <p className="mt-1 text-[0.72rem] text-moon">
            Gulberg · <span className="rounded-slip bg-haldi px-1 py-px font-semibold text-ink">Table T4</span>
          </p>
        </div>
      </div>
      <div className="flex gap-1.5 border-b border-rule px-3 py-2 text-[0.68rem] font-semibold text-ink-2">
        {['Karahi', 'Rice', 'BBQ', 'Desi', 'Bread'].map((name) => (
          <span key={name} className={`rounded-full border px-2.5 py-1 ${name === 'BBQ' ? 'border-indigo text-indigo' : 'border-rule bg-paper'}`}>
            {name}
          </span>
        ))}
      </div>
      <p className="px-4 pt-3 font-sans text-[0.9rem] font-bold text-ink">BBQ</p>
      <ul className="mt-2 flex flex-col gap-2 px-3">
        {DISHES.map((dish) => (
          <li key={dish.name} className="flex items-end justify-between rounded-[16px] bg-paper p-3 shadow-slip">
            <span>
              <span className="block text-[0.8rem] font-semibold text-ink">{dish.name}</span>
              <span className="mt-2 block text-[0.75rem] font-semibold text-ink">{dish.price}</span>
            </span>
            <AddOrCount tap={dish.tap} />
          </li>
        ))}
      </ul>

      {/* The bar: View your order once something is in it, above Call waiter and Ask for bill. */}
      <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 border-t border-rule bg-paper px-3 pt-2 pb-4">
        <div className="motion-safe:tour-pop" style={tourAt(0.4)}>
          <span className="flex min-h-10 items-center gap-2 rounded-full bg-indigo ps-3.5 pe-4 text-[0.75rem] font-semibold text-white motion-safe:tour-tap" style={tourAt(1.5)}>
            <ShoppingBag className="size-4" />
            <span className="flex-1">View your order</span>
            <span className="grid">
              <span className="[grid-area:1/1] motion-safe:tour-hide motion-reduce:hidden" style={tourAt(0.9)}>Rs 680</span>
              <span className="[grid-area:1/1] motion-safe:tour-pop" style={tourAt(0.9)}>Rs 1,100</span>
            </span>
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 text-[0.7rem] font-semibold text-ink">
          <span className="rounded-full bg-canvas py-2 text-center ring-1 ring-rule">Call waiter</span>
          <span className="rounded-full bg-canvas py-2 text-center ring-1 ring-rule">Ask for bill</span>
        </div>
      </div>

      {/* The order sheet: Send to the kitchen, then the order's number. */}
      <div className="absolute inset-x-0 bottom-0 rounded-t-[20px] bg-paper px-4 pt-2 pb-4 shadow-[0_-20px_40px_-20px_rgb(18_21_46/0.4)] motion-safe:tour-pop motion-reduce:hidden" style={tourAt(1.8)}>
        <span className="mx-auto mb-2 block h-1 w-8 rounded-full bg-rule" />
        <p className="text-[0.85rem] font-bold text-ink">Your order</p>
        <p className="mt-2 flex justify-between border-b border-rule pb-1.5 text-[0.72rem] text-ink-2">
          <span>Seekh Kabab (4 pcs)</span>
          <span>× 1</span>
        </p>
        <p className="mt-1.5 flex justify-between text-[0.72rem] text-ink-2">
          <span>Chicken Tikka</span>
          <span>× 1</span>
        </p>
        <span className="mt-3 flex min-h-10 items-center justify-between rounded-control bg-indigo px-3.5 text-[0.75rem] font-semibold text-white motion-safe:tour-tap" style={tourAt(2.5)}>
          Send to the kitchen <span>Rs 1,100</span>
        </span>
        <p className="mt-1.5 text-center text-[0.6rem] text-ink-3">You pay at the end. Tax, if any, is added on the bill.</p>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center rounded-t-[20px] bg-paper px-4 pt-4 pb-5 text-center motion-safe:tour-pop" style={tourAt(2.8)}>
        <p className="self-start text-[0.85rem] font-bold text-ink">Order sent</p>
        <CheckCircle2 className="mt-3 size-8 text-leaf" />
        <p className="mt-1 font-slip text-[0.65rem] text-ink-3">Your order</p>
        <p className="display text-[2.2rem] text-ink">#1</p>
        <p className="mt-1 text-[0.68rem] leading-snug text-ink-2">Sent. A waiter will confirm it in a moment, then the kitchen starts.</p>
      </div>
    </div>
  );
}
