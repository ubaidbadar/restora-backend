import { CircleCheck, X } from 'lucide-react';
import BranchTabs from './branch_tabs';
import StaffNav from './staff_nav';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

/** Each way to pay with its own total: tax is set per payment method (here 16% cash, 5% the rest). */
const METHODS = [
  ['Cash', 'Rs 1,276'],
  ['Card', 'Rs 1,155'],
  ['JazzCash', 'Rs 1,155'],
  ['Easypaisa', 'Rs 1,155'],
  ['Bank transfer', 'Rs 1,155'],
];

/**
 * Step 5, on the counter's phone, as the real app: Pay opens how the guest paid, each with its total after tax; JazzCash
 * is tapped, and Home already counts the sale.
 */
export default function PaidScene() {
  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <StatusBar time="8:12" />
      <div className="px-4 pt-1">
        <p className="text-[1.05rem] font-bold text-ink">Lahori Karahi House</p>
        <p className="text-[0.65rem] text-ink-3">Fri, 23 Oct · Gulberg</p>
      </div>
      <BranchTabs />
      <div className="mx-3 mt-3 grid grid-cols-2 overflow-hidden rounded-[8px] bg-paper text-ink shadow-slip">
        <div className="border-e border-b border-rule p-3">
          <p className="text-[0.6rem] text-ink-3">Sales today</p>
          <p className="grid text-[1.05rem] font-bold">
            <span className="[grid-area:1/1] motion-safe:tour-hide motion-reduce:hidden" style={tourAt(2.3)}>Rs 83,195</span>
            <span className="[grid-area:1/1] motion-safe:tour-pop" style={tourAt(2.3)}>Rs 84,350</span>
          </p>
          <p className="text-[0.58rem] text-ink-3">61 orders</p>
        </div>
        <div className="border-b border-rule p-3">
          <p className="text-[0.6rem] text-ink-3">Average order</p>
          <p className="text-[1.05rem] font-bold">Rs 1,383</p>
        </div>
        <div className="border-e border-rule p-3">
          <p className="text-[0.6rem] text-ink-3">New customers</p>
          <p className="text-[1.05rem] font-bold">7</p>
        </div>
        <div className="p-3">
          <p className="text-[0.6rem] text-ink-3">Khata outstanding</p>
          <p className="text-[1.05rem] font-bold">Rs 6,050</p>
        </div>
      </div>
      <div className="mx-3 mt-2 rounded-[8px] bg-paper p-3 text-[0.65rem] text-ink-2 shadow-slip">
        <p className="text-[0.75rem] font-bold text-ink">Cash vs digital</p>
        <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-canvas">
          <span className="w-[46%] rounded-full bg-indigo" />
        </div>
        <p className="mt-1.5 flex justify-between"><span>Cash (46%)</span><span>Rs 38,800</span></p>
        <p className="flex justify-between"><span>Card, JazzCash, Easypaisa, bank (54%)</span><span>Rs 45,550</span></p>
      </div>

      {/* Order #1's Pay sheet, over the board. */}
      <div className="absolute inset-0 flex flex-col justify-end bg-ink/40 motion-safe:tour-hide motion-reduce:hidden" style={tourAt(2.1)}>
        <div className="rounded-t-[20px] bg-paper px-4 pt-2 pb-5">
          <span className="mx-auto mb-2 block h-1 w-8 rounded-full bg-rule" />
          <p className="text-[0.85rem] font-bold text-ink">Order #1</p>
          <p className="mt-1 text-[0.62rem] text-ink-3">How did the customer pay? Tax depends on it, so each way shows its own total.</p>
          <ul className="mt-2.5 flex flex-col gap-1.5">
            {METHODS.map(([method, total]) => (
              <li
                key={method}
                className={`flex justify-between rounded-[5px] px-3 py-1.5 text-[0.7rem] text-ink ring-1 ring-ink-3/50 ${method === 'JazzCash' ? 'motion-safe:tour-tap' : ''}`}
                style={method === 'JazzCash' ? tourAt(1.4) : undefined}
              >
                <span>{method}</span>
                <span>{total}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* The app's toast: a tick, what happened, and a close button. */}
      <div className="absolute inset-x-3 bottom-[3.9rem] flex items-center gap-2 rounded-[5px] bg-paper px-3 py-2.5 text-[0.68rem] text-ink shadow-lift ring-1 ring-rule motion-safe:tour-pop" style={tourAt(2.1)}>
        <CircleCheck className="size-3.5 text-leaf" />
        <span className="flex-1">Order #1 paid by JazzCash</span>
        <X className="size-3 text-ink-3" />
      </div>
      <StaffNav active="Home" />
    </div>
  );
}
