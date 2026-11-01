import type { ReactNode } from 'react';
import { BellRing, CalendarClock, CalendarDays, Check, SlidersHorizontal, Smartphone } from 'lucide-react';
import PhoneIsland from '../../components/phone_island';
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
  ['Cancelled', '2 orders', 'Rs 2,100'],
];

const SPLIT = [
  ['Cash (65%)', 'Rs 51,200'],
  ['Card, JazzCash, Easypaisa, bank (35%)', 'Rs 27,350'],
  ['Not collected yet (unpaid or khata)', 'Rs 5,800'],
];

/**
 * One thing happening somewhere in the restaurant: a note beside the phone. On a phone screen there is no room beside it,
 * so the note shows inside the drawn phone instead, as the app shows it: a toast above the bottom bar.
 */
function Note({ at, className, children }: { at: number; className: string; children: ReactNode }) {
  return (
    <div style={tourAt(at)} className={`absolute flex max-w-[13.5rem] items-center gap-2.5 rounded-[16px] p-3 text-[0.8rem] leading-snug shadow-lift animate-note max-sm:inset-x-0 max-sm:z-10 max-sm:mx-auto max-sm:w-[15.75rem] max-sm:max-w-none max-sm:rounded-[14px] max-sm:p-2.5 max-sm:text-[0.72rem] max-sm:[animation:rise_700ms_var(--ease-print)_var(--at,0s)_both] ${className}`}>
      {children}
    </div>
  );
}

/**
 * The hero's picture: the owner's phone on a Friday night showing the app's Home screen, and what is happening around
 * the restaurant arriving beside it one note at a time: a guest's order from the table, a call, a booking, a payment.
 * The screen is laid out at the app's real size (a 384px wide phone, the app's own corners, type and greys) and zoomed
 * down to the drawn phone, so it stays true to the app instead of being redrawn by eye.
 */
export default function HeroStage() {
  return (
    <div role="img" aria-label="Restora on a phone: today's numbers, orders by type and cash against digital, with a table's order, a waiter call, a booking and a payment arriving" className="relative mx-auto w-full max-w-[30rem] max-sm:flex max-sm:justify-center sm:h-[38rem]">
      <div className="relative h-[37.5rem] w-[17.5rem] animate-rise sm:absolute sm:inset-y-0 sm:end-0 sm:h-auto">
        <div className="phone relative h-full">
          <PhoneIsland />
          <div className="phone-screen flex h-full flex-col bg-app-canvas">
            <StatusBar time="8:47" />
            <div className="min-h-0 flex-1 overflow-hidden">
              {/* The app's Home at 384px wide (restora-web dashboard_page), zoomed to the screen's 262px (17.5rem less the bezels). */}
              <div className="flex w-[384px] flex-col px-4 pt-2 font-app [zoom:0.682]">
                {/* On a phone the header keeps only Filter: New order is the round + in the bottom bar. */}
                <div className="mb-5 flex justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[1.25rem] leading-[1.25] font-[650] tracking-[-0.015em] text-ink">Lahori Karahi House</p>
                    <p className="mt-0.5 truncate text-sm text-app-muted">Gulberg</p>
                  </div>
                  <span className="grid size-11 shrink-0 place-items-center rounded-app-control border border-app-border-strong bg-paper text-ink">
                    <SlidersHorizontal className="size-[18px]" />
                  </span>
                </div>
                <p className="mb-4 flex items-center gap-2 text-sm text-app-body">
                  <CalendarDays className="size-4 text-app-muted" />
                  <span>
                    <span className="font-semibold text-ink">Today</span> · This branch
                  </span>
                </p>
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-px overflow-hidden rounded-app-card bg-app-border shadow-[0_0_0_1px_var(--color-app-border),0_1px_2px_rgb(15_23_42/0.04)]">
                    {STATS.map((stat) => (
                      <div key={stat.label} className="bg-paper px-4 py-3.5">
                        <p className="text-sm text-app-muted">{stat.label}</p>
                        <p className="mt-1 text-[1.375rem] leading-7 font-semibold tracking-[-0.01em] text-ink tabular-nums">{stat.value}</p>
                        <p className="mt-0.5 h-4 text-xs text-app-muted">{stat.note}</p>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-app-card bg-paper p-4 shadow-[0_0_0_1px_var(--color-app-border),0_1px_2px_rgb(15_23_42/0.04)]">
                    <p className="mb-3 font-semibold tracking-[-0.005em] text-ink">Orders by type</p>
                    <table className="w-full text-sm">
                      <tbody>
                        {TYPES.map(([type, count, total]) => (
                          <tr key={type} className="border-b border-app-border last:border-0">
                            <th scope="row" className="py-2.5 text-start font-medium text-ink">{type}</th>
                            <td className="py-2.5 text-end whitespace-nowrap text-app-muted tabular-nums">{count}</td>
                            <td className="w-28 py-2.5 text-end font-semibold whitespace-nowrap text-ink tabular-nums">{total}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="rounded-app-card bg-paper p-4 shadow-[0_0_0_1px_var(--color-app-border),0_1px_2px_rgb(15_23_42/0.04)]">
                    <p className="mb-3 font-semibold tracking-[-0.005em] text-ink">Cash vs digital</p>
                    <p className="mb-4 h-2.5 overflow-hidden rounded-full bg-app-sunken">
                      <span className="block h-full w-[65%] rounded-full bg-indigo" />
                    </p>
                    <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2.5 text-sm text-app-body">
                      {SPLIT.map(([label, total]) => (
                        <div key={label} className="contents">
                          <dt>{label}</dt>
                          <dd className="text-end font-semibold whitespace-nowrap text-ink tabular-nums">{total}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                </div>
              </div>
            </div>
            <StaffNav active="Home" />
          </div>
        </div>
      </div>

      <Note at={0.9} className="bottom-[9.25rem] sm:top-[8%] sm:bottom-auto sm:start-0 bg-paper text-ink">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-indigo-wash text-indigo max-sm:size-7">
          <Smartphone className="size-4" />
        </span>
        <span>
          <span className="block font-semibold">Table T4 sent order #28</span>
          <span className="block text-ink-3">From their table&apos;s QR code</span>
        </span>
      </Note>
      <Note at={1.5} className="top-[30%] start-3 max-sm:hidden bg-haldi text-ink">
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
      <Note at={2.7} className="bottom-[5.5rem] sm:top-[74%] sm:bottom-auto sm:start-3 bg-leaf text-white">
        <Check className="size-5 shrink-0" strokeWidth={3} />
        <span>
          <span className="block font-semibold">Order #27 paid by JazzCash</span>
          <span className="block opacity-85">Rs 1,155, tax included</span>
        </span>
      </Note>
    </div>
  );
}
