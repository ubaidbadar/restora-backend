import { Smartphone } from 'lucide-react';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

const PREPARING = [
  { no: '#25', where: 'Table 9', items: '2× Mutton karahi, 8× Naan' },
  { no: '#26', where: 'Takeaway', items: '3× Chicken biryani' },
];

/** Step 3, on a waiter's phone: table 4's order arrives on the live board, is accepted, and the kitchen slip prints. */
export default function BoardScene() {
  return (
    <div className="flex h-full flex-col bg-canvas">
      <StatusBar time="7:03" />
      <div className="flex items-center justify-between px-5 pt-1">
        <p className="font-display text-xl font-bold tracking-tight text-ink">Orders</p>
        <span className="flex items-center gap-1.5 rounded-full bg-leaf-soft px-2.5 py-1 text-[0.7rem] font-semibold text-leaf">
          <span className="size-1.5 rounded-full bg-leaf" />
          Live
        </span>
      </div>
      <div className="mt-3 flex gap-1.5 px-5 text-[0.7rem] font-semibold">
        <span className="rounded-full bg-haldi px-2.5 py-1 text-ink">New 1</span>
        <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2">Preparing 2</span>
        <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2">Ready 3</span>
      </div>

      <div className="mt-3 flex flex-col gap-2 px-3">
        {/* The new order, from the guest's own phone. */}
        <div className="rounded-[14px] bg-paper p-3 ring-2 ring-haldi motion-safe:tour-pop" style={tourAt(0.3)}>
          <div className="rounded-[14px] motion-safe:tour-ring" style={tourAt(0.5)}>
            <div className="flex items-baseline justify-between">
              <span className="font-display text-lg font-bold text-ink">#28</span>
              <span className="text-[0.75rem] font-semibold text-ink-2">Table 4</span>
            </div>
            <p className="flex items-center gap-1 text-[0.7rem] text-ink-3">
              <Smartphone className="size-3" />
              Sent from the table&apos;s QR menu
            </p>
            <p className="mt-1.5 text-[0.75rem] text-ink-2">Chicken karahi (half), Tandoori roti, Fresh lime</p>
            <div className="mt-2.5 grid">
              <span className="[grid-area:1/1] rounded-control bg-indigo py-1.5 text-center text-[0.75rem] font-semibold text-white motion-safe:tour-tap" style={tourAt(1.3)}>
                <span className="block motion-safe:tour-hide motion-reduce:hidden" style={tourAt(1.5)}>Accept</span>
              </span>
              <span className="[grid-area:1/1] rounded-control bg-leaf-soft py-1.5 text-center text-[0.75rem] font-semibold text-leaf motion-safe:tour-pop" style={tourAt(1.5)}>
                Accepted · preparing
              </span>
            </div>
          </div>
        </div>
        {PREPARING.map((order) => (
          <div key={order.no} className="rounded-[14px] bg-paper p-3 opacity-70">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-base font-bold text-ink">{order.no}</span>
              <span className="text-[0.75rem] text-ink-3">{order.where}</span>
            </div>
            <p className="text-[0.75rem] text-ink-2">{order.items}</p>
          </div>
        ))}
      </div>

      {/* The kitchen slip prints as soon as it is accepted. */}
      <div className="mx-auto mt-auto mb-4 w-[85%] motion-safe:tour-print" style={tourAt(1.8)}>
        <div className="tear-bottom bg-paper px-4 pt-3 pb-5 font-slip text-[0.7rem] leading-relaxed text-ink shadow-slip">
          <p className="flex justify-between font-semibold">
            <span>KITCHEN #28</span>
            <span>Table 4</span>
          </p>
          <p>1 Chicken karahi (half)</p>
          <p className="text-ink-3">&nbsp;&nbsp;less spicy</p>
          <p>1 Tandoori roti · 1 Fresh lime</p>
        </div>
      </div>
    </div>
  );
}
