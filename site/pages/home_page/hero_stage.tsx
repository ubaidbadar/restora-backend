import type { ReactNode } from 'react';
import { BellRing, CalendarClock, Check, Smartphone } from 'lucide-react';
import PhoneIsland from '../../components/phone_island';
import BranchTabs from './order_tour/branch_tabs';
import StaffNav from './order_tour/staff_nav';
import StatusBar from './order_tour/status_bar';
import tourAt from '../../utils/tour_at';

const STATS = [
  { label: 'Sales today', value: 'Rs 84,350', note: '61 orders' },
  { label: 'Average order', value: 'Rs 1,383', note: '' },
  { label: 'New customers', value: '7', note: 'Added today' },
  { label: 'Khata outstanding', value: 'Rs 6,050', note: '2 customers owe' },
];

const TYPES = [
  ['Dine-in', '38 orders', 'Rs 55,900'],
  ['Takeaway', '17 orders', 'Rs 19,250'],
  ['Delivery', '6 orders', 'Rs 9,200'],
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
 * The hero's picture: the owner's phone on a Friday night, drawn from the app's Home screen, and what is happening
 * around the restaurant arriving beside it one note at a time, in the app's own words: a guest's order from the table,
 * a call, a booking, a payment.
 */
export default function HeroStage() {
  return (
    <div role="img" aria-label="Restora on a phone: today's sales and orders by type, with a table's order, a waiter call, a booking and a payment arriving" className="relative mx-auto h-[34rem] w-full max-w-[30rem] sm:h-[38rem]">
      <div className="absolute inset-y-0 inset-x-0 mx-auto w-[16.5rem] animate-rise sm:start-auto sm:me-0 sm:w-[17.5rem]">
        <div className="phone relative h-full">
          <PhoneIsland />
          <div className="phone-screen flex h-full flex-col bg-canvas">
            <StatusBar time="8:47" />
            <div className="px-4 pt-1">
              <p className="text-[1.05rem] font-bold text-ink">Lahori Karahi House</p>
              <p className="text-[0.65rem] text-ink-3">Fri, 23 Oct · Gulberg</p>
            </div>
            <BranchTabs />
            <div className="mx-3 mt-3 grid grid-cols-2 overflow-hidden rounded-[12px] bg-paper text-ink shadow-slip">
              {STATS.map((stat, index) => (
                <div key={stat.label} className={`p-3 ${index % 2 === 0 ? 'border-e' : ''} ${index < 2 ? 'border-b' : ''} border-rule`}>
                  <p className="text-[0.6rem] text-ink-3">{stat.label}</p>
                  <p className="text-[1rem] font-bold">{stat.value}</p>
                  <p className="text-[0.55rem] text-ink-3">{stat.note}</p>
                </div>
              ))}
            </div>
            <div className="mx-3 mt-2 rounded-[12px] bg-paper p-3 text-[0.65rem] text-ink-2 shadow-slip">
              <p className="text-[0.75rem] font-bold text-ink">Orders by type</p>
              {TYPES.map(([type, count, total]) => (
                <p key={type} className="mt-1.5 flex justify-between border-b border-rule pb-1.5 last:border-0 last:pb-0">
                  <span className="w-16 text-ink">{type}</span>
                  <span>{count}</span>
                  <span className="font-semibold text-ink">{total}</span>
                </p>
              ))}
            </div>
            <StaffNav active="Home" />
          </div>
        </div>
      </div>

      <Note at={0.9} className="bottom-[15%] start-0 sm:top-[8%] sm:bottom-auto bg-paper text-ink">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-wash text-indigo">
          <Smartphone className="size-4" />
        </span>
        <span>
          <span className="block font-semibold">Table T4 sent order #28</span>
          <span className="block text-ink-3">From their table&apos;s QR code</span>
        </span>
      </Note>
      <Note at={1.5} className="top-[30%] start-0 max-sm:hidden sm:start-8 bg-haldi text-ink">
        <BellRing className="size-5 shrink-0" />
        <span className="font-semibold">Table T7 calls a waiter</span>
      </Note>
      <Note at={2.1} className="top-[52%] start-0 max-sm:hidden bg-paper text-ink">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-haldi-soft text-ink">
          <CalendarClock className="size-4" />
        </span>
        <span>
          <span className="block font-semibold">Booking at 9:30 pm, 6 guests</span>
          <span className="block text-ink-3">Ahmed Raza · Table T12</span>
        </span>
      </Note>
      <Note at={2.7} className="bottom-[3%] end-0 sm:start-8 sm:end-auto sm:top-[74%] sm:bottom-auto bg-leaf text-white">
        <Check className="size-5 shrink-0" strokeWidth={3} />
        <span>
          <span className="block font-semibold">Order #27 paid by JazzCash</span>
          <span className="block opacity-85">Rs 1,155, tax included</span>
        </span>
      </Note>
    </div>
  );
}
