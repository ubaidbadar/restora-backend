import { BellRing } from 'lucide-react';
import StaffNav from './staff_nav';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

/** The hall, as the real Tables page draws it: busy tables ringed in indigo with their bill and time, T4 among them. */
const TABLES = [
  { name: 'T1', bill: '' },
  { name: 'T2', bill: 'Rs 1,940 · 27 min' },
  { name: 'T3', bill: '' },
  { name: 'T4', bill: 'Rs 1,100 · 28 min' },
  { name: 'T5', bill: 'Rs 3,840 · 12 min' },
  { name: 'T6', bill: '' },
];

/**
 * Step 4: the guest taps Call waiter; on a waiter's phone, as the real Tables page, the table needs them and its tile
 * says so. Done clears the call for everyone.
 */
export default function TablesScene() {
  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <StatusBar time="7:31" />
      <div className="px-4 pt-1">
        <p className="text-[1.05rem] font-bold text-ink">Tables</p>
        <p className="text-[0.65rem] text-ink-3">Who needs you, table by table</p>
      </div>

      {/* "1 table needs you", until Done. */}
      <div className="mx-3 mt-2.5 motion-safe:tour-pop" style={tourAt(0.4)}>
        <div className="rounded-[12px] bg-haldi-soft/60 p-2 ring-1 ring-haldi/60 motion-safe:tour-hide motion-reduce:hidden" style={tourAt(2.4)}>
          <p className="text-[0.66rem] font-bold text-haldi-deep">1 table needs you</p>
          <div className="mt-1.5 flex items-center gap-2 rounded-[10px] bg-paper p-2 text-[0.63rem] text-ink">
            <BellRing className="size-3.5 text-haldi-deep" />
            <span className="flex-1">
              <b>Table T4</b> called a waiter · just now
            </span>
            <span className="rounded-[8px] bg-indigo px-2 py-1 font-semibold text-white motion-safe:tour-tap" style={tourAt(2)}>
              Done
            </span>
          </div>
        </div>
      </div>

      <div className="mt-2.5 flex gap-1.5 px-4 text-[0.6rem] font-semibold">
        <span className="rounded-full bg-ink px-2.5 py-1 text-white">All <span className="font-normal text-white/70">10</span></span>
        <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2 ring-1 ring-rule">Busy <span className="font-normal text-ink-3">3</span></span>
        <span className="rounded-full bg-paper px-2.5 py-1 text-ink-2 ring-1 ring-rule">Free <span className="font-normal text-ink-3">7</span></span>
      </div>
      <p className="mt-2 px-4 text-[0.7rem] font-bold text-ink">Hall</p>
      <ul className="mt-1.5 grid grid-cols-2 gap-1.5 px-3">
        {TABLES.map((table) => (
          <li key={table.name} className={`relative rounded-[12px] bg-paper p-2 ${table.bill ? 'ring-2 ring-indigo' : 'ring-1 ring-rule'}`}>
            <Tile name={table.name} badge={table.bill ? 'Eating' : 'Free'} line={table.bill} />
            {table.name === 'T4' && (
              <span className="absolute inset-0 motion-safe:tour-pop motion-reduce:hidden" style={tourAt(0.4)}>
                <span className="block h-full rounded-[12px] bg-paper p-2 ring-2 ring-haldi-deep motion-safe:tour-hide" style={tourAt(2.4)}>
                  <Tile name="T4" badge="Waiter called" line="just now" call />
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <StaffNav active="Home" />
    </div>
  );
}

/** A table's tile: its name and seats, what is going on there, and the bill or the call's time. */
function Tile({ name, badge, line, call = false }: { name: string; badge: string; line: string; call?: boolean }) {
  const tone = call ? 'bg-haldi-soft/70 text-haldi-deep ring-haldi/50' : badge === 'Free' ? 'bg-canvas text-ink-3 ring-rule' : 'bg-indigo-wash text-indigo ring-indigo/25';
  return (
    <>
      <span className="flex justify-between text-[0.78rem] font-bold text-ink">
        {name} <span className="text-[0.55rem] font-normal text-ink-3">4 seats</span>
      </span>
      <span className={`mt-2 inline-block rounded-[5px] px-1.5 py-0.5 text-[0.56rem] font-semibold ring-1 ${tone}`}>{badge}</span>
      <span className="block h-4 text-[0.58rem] text-ink-2">{line}</span>
    </>
  );
}
