import { ArrowRight, Banknote, Clock, Info, MoreHorizontal, Plus, Search, SlidersHorizontal } from 'lucide-react';
import StaffNav from './staff_nav';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

/**
 * Step 3, on a waiter's phone, as the real Orders board: table T4's order arrives in New with a chime and a notice,
 * marked From table QR, and is accepted; Pay and Start take its place.
 */
export default function BoardScene() {
  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <StatusBar time="7:03" />
      <div className="flex items-start justify-between px-4 pt-1">
        <div>
          <p className="text-[1.05rem] font-bold text-ink">Orders</p>
          <p className="text-[0.65rem] text-ink-3">Today · Gulberg</p>
        </div>
        <span className="flex items-center gap-1 rounded-[5px] bg-indigo px-2.5 py-1.5 text-[0.65rem] font-semibold text-white">
          <Plus className="size-3" /> New order
        </span>
      </div>
      {/* Search and the one Filter button, then the statuses as chips: the picked one dark, each with its count. */}
      <div className="mx-4 mt-3 flex gap-1.5">
        <span className="flex flex-1 items-center gap-1.5 rounded-[5px] bg-paper px-2.5 py-1.5 text-[0.62rem] text-ink-3 ring-1 ring-rule">
          <Search className="size-3" /> Search orders
        </span>
        <span className="grid w-7 place-items-center rounded-[5px] bg-paper text-ink-2 ring-1 ring-rule">
          <SlidersHorizontal className="size-3" />
        </span>
      </div>
      <div className="mt-2.5 flex gap-1.5 overflow-hidden px-4 text-[0.62rem] font-semibold whitespace-nowrap">
        <span className="flex items-center gap-1 rounded-full bg-ink px-2.5 py-1 text-white">
          New
          <span className="grid font-normal text-white/70">
            <span className="[grid-area:1/1] motion-safe:tour-hide motion-reduce:hidden" style={tourAt(0.3)}>0</span>
            <span className="[grid-area:1/1] motion-safe:tour-pop" style={tourAt(0.3)}>1</span>
          </span>
        </span>
        <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2 ring-1 ring-rule">Preparing <span className="font-normal text-ink-3">0</span></span>
        <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2 ring-1 ring-rule">Ready <span className="font-normal text-ink-3">0</span></span>
        <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2 ring-1 ring-rule">On the way</span>
      </div>

      <div className="mx-3 mt-3 motion-safe:tour-pop" style={tourAt(0.3)}>
        <div className="rounded-[8px] bg-paper p-3 ring-1 ring-rule motion-safe:tour-ring" style={tourAt(0.4)}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[1.3rem] leading-none font-bold text-ink">#1</p>
              <p className="mt-1 text-[0.62rem] text-ink-3">Dine-in · Table T4</p>
            </div>
            <div className="flex flex-col items-end gap-1 text-[0.58rem] font-semibold">
              <span className="flex items-center gap-0.5 rounded-[4px] bg-canvas px-1.5 py-0.5 text-ink-2 ring-1 ring-rule">
                <Clock className="size-2.5" /> 0 min
              </span>
              <span className="rounded-[4px] bg-haldi-soft/70 px-1.5 py-0.5 text-haldi-deep ring-1 ring-haldi/50">Unpaid</span>
              <span className="rounded-[4px] bg-haldi-soft/70 px-1.5 py-0.5 text-haldi-deep ring-1 ring-haldi/50 motion-safe:tour-hide motion-reduce:hidden" style={tourAt(1.9)}>
                From table QR
              </span>
            </div>
          </div>
          <p className="mt-2 text-[0.68rem] text-ink-2">1 × Seekh Kabab (4 pcs)</p>
          <p className="text-[0.68rem] text-ink-2">1 × Chicken Tikka</p>
          <div className="mt-2 flex items-center justify-between border-t border-rule pt-2">
            <span className="text-[0.75rem] font-semibold text-ink">
              Rs 1,100
              <span className="block text-[0.55rem] font-normal text-ink-3">+ tax when paid</span>
            </span>
            <MoreHorizontal className="size-4 text-ink-3" />
          </div>
          <div className="mt-2 grid text-[0.68rem] font-semibold">
            <div className="[grid-area:1/1] grid grid-cols-2 gap-1.5 motion-safe:tour-hide motion-reduce:hidden" style={tourAt(1.9)}>
              <span className="rounded-[5px] py-2 text-center text-ink ring-1 ring-ink-3/50">Turn down</span>
              <span className="flex items-center justify-center gap-1 rounded-[5px] bg-indigo py-2 text-white motion-safe:tour-tap" style={tourAt(1.5)}>
                Accept <ArrowRight className="size-3" />
              </span>
            </div>
            <div className="[grid-area:1/1] grid grid-cols-2 gap-1.5 bg-paper motion-safe:tour-pop" style={tourAt(1.9)}>
              <span className="flex items-center justify-center gap-1 rounded-[5px] py-2 text-ink ring-1 ring-ink-3/50">
                <Banknote className="size-3" /> Pay
              </span>
              <span className="flex items-center justify-center gap-1 rounded-[5px] bg-indigo py-2 text-white">
                Start <ArrowRight className="size-3" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* The notice every signed-in screen shows, with a chime. */}
      <div className="absolute inset-x-3 bottom-[3.9rem] flex items-center gap-2 rounded-[5px] bg-paper px-3 py-2.5 text-[0.68rem] text-ink shadow-lift ring-1 ring-rule motion-safe:tour-pop" style={tourAt(0.5)}>
        <Info className="size-3.5 text-indigo" />
        <span className="flex-1">Table T4 sent order #1</span>
        <span className="font-semibold text-indigo">Open</span>
      </div>
      <StaffNav active="Orders" />
    </div>
  );
}
