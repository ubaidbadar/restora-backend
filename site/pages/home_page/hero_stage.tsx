import type { ReactNode } from 'react';
import { BellRing, CalendarClock, Check, Smartphone } from 'lucide-react';
import StatusBar from './order_tour/status_bar';
import tourAt from '../../utils/tour_at';

const BOARD = [
  { label: 'New', count: 2, tone: 'bg-haldi text-ink' },
  { label: 'Preparing', count: 5, tone: 'bg-indigo-wash text-indigo' },
  { label: 'Ready', count: 3, tone: 'bg-leaf-soft text-leaf' },
];

/** One thing happening somewhere in the restaurant, as a note floating beside the phone. */
function Note({ at, className, children }: { at: number; className: string; children: ReactNode }) {
  return (
    <div style={tourAt(at)} className={`absolute flex max-w-[13.5rem] items-center gap-2.5 rounded-[16px] p-3 text-[0.8rem] leading-snug shadow-lift animate-note ${className}`}>
      {children}
    </div>
  );
}

/**
 * The hero's picture: the owner's phone on a Friday night, and what is happening around the restaurant arriving
 * beside it one note at a time: a guest's order from the table, a call, a booking, a payment. Drawn, not a screenshot.
 */
export default function HeroStage() {
  return (
    <div role="img" aria-label="Restora on a phone: today's sales and the live orders board, with a table's order, a waiter call, a booking and a payment arriving" className="relative mx-auto h-[34rem] w-full max-w-[30rem] sm:h-[38rem]">
      <div className="absolute inset-y-0 inset-x-0 mx-auto w-[16.5rem] animate-rise sm:start-auto sm:me-0 sm:w-[17.5rem]">
        <div className="h-full rounded-[2.8rem] bg-ink p-[9px] shadow-[0_50px_100px_-40px_rgb(23_19_74/0.65),inset_0_0_0_2px_rgb(255_255_255/0.08)]">
          <div className="relative flex h-full flex-col overflow-hidden rounded-[2.25rem] bg-canvas">
            <span aria-hidden="true" className="absolute top-2.5 left-1/2 h-6 w-24 -translate-x-1/2 rounded-full bg-ink" />
            <StatusBar time="8:47" />
            <div className="px-5 pt-2">
              <p className="text-[0.7rem] font-semibold text-ink-3">Lahori Karahi House · Gulberg</p>
              <p className="font-display text-xl font-bold tracking-tight text-ink">Today</p>
            </div>
            <div className="mx-3 mt-3 rounded-[18px] bg-night p-4 text-white">
              <p className="text-[0.7rem] text-moon">Sales so far</p>
              <p className="font-display text-[1.9rem] leading-tight font-bold tracking-tight">Rs 84,350</p>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/10">
                <span className="w-[46%] bg-haldi" />
                <span className="w-[38%] bg-moon" />
                <span className="w-[16%] bg-leaf" />
              </div>
              <p className="mt-2 flex justify-between text-[0.65rem] text-moon">
                <span>Cash 46%</span>
                <span>JazzCash 38%</span>
                <span>Card 16%</span>
              </p>
            </div>
            <div className="mx-3 mt-2.5 grid grid-cols-3 gap-2">
              {BOARD.map((column) => (
                <div key={column.label} className="rounded-[14px] bg-paper p-2.5 text-center">
                  <p className={`mx-auto grid size-8 place-items-center rounded-full font-display text-base font-bold ${column.tone}`}>{column.count}</p>
                  <p className="mt-1 text-[0.65rem] font-semibold text-ink-2">{column.label}</p>
                </div>
              ))}
            </div>
            <div className="mx-3 mt-2.5 rounded-[14px] bg-paper p-3">
              <p className="text-[0.65rem] font-semibold text-ink-3">Tables</p>
              <div className="mt-2 grid grid-cols-6 gap-1.5">
                {[1, 1, 0, 1, 1, 0, 1, 1, 1, 0, 1, 1].map((busy, index) => (
                  <span key={index} className={`aspect-square rounded-[6px] ${index === 3 ? 'bg-haldi' : busy ? 'bg-indigo-wash' : 'border border-dashed border-rule'}`} />
                ))}
              </div>
            </div>
            <div className="mt-auto flex items-center justify-around border-t border-rule bg-paper px-4 pt-2.5 pb-5 text-[0.6rem] font-semibold text-ink-3">
              <span className="text-indigo">Home</span>
              <span>Orders</span>
              <span className="grid size-9 place-items-center rounded-full bg-indigo text-lg text-white">+</span>
              <span>Tables</span>
              <span>More</span>
            </div>
          </div>
        </div>
      </div>

      <Note at={0.9} className="bottom-[15%] start-0 sm:top-[8%] sm:bottom-auto bg-paper text-ink">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-wash text-indigo">
          <Smartphone className="size-4" />
        </span>
        <span>
          <span className="block font-semibold">Order #28 from table 4</span>
          <span className="block text-ink-3">Sent from their QR menu</span>
        </span>
      </Note>
      <Note at={1.5} className="top-[30%] start-0 max-sm:hidden sm:start-8 bg-haldi text-ink">
        <BellRing className="size-5 shrink-0" />
        <span className="font-semibold">Table 7 is calling a waiter</span>
      </Note>
      <Note at={2.1} className="top-[52%] start-0 max-sm:hidden bg-paper text-ink">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-haldi-soft text-ink">
          <CalendarClock className="size-4" />
        </span>
        <span>
          <span className="block font-semibold">Booked: 9:30 pm, 6 guests</span>
          <span className="block text-ink-3">Ahmed · table 12</span>
        </span>
      </Note>
      <Note at={2.7} className="bottom-[3%] end-0 sm:start-8 sm:end-auto sm:top-[74%] sm:bottom-auto bg-leaf text-white">
        <Check className="size-5 shrink-0" strokeWidth={3} />
        <span>
          <span className="block font-semibold">Paid Rs 1,491</span>
          <span className="block opacity-85">JazzCash · receipt on WhatsApp</span>
        </span>
      </Note>
    </div>
  );
}
