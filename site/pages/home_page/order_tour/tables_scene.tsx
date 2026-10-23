import { BellRing } from 'lucide-react';
import StaffNav from './staff_nav';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

/** The hall, as the real Tables page draws it: T4 has an order going, and calls the waiter in this step. */
const TABLES = [
  { name: 'T1', state: 'Free' },
  { name: 'T2', state: 'Eating' },
  { name: 'T3', state: 'Free' },
  { name: 'T4', state: 'Eating' },
  { name: 'T5', state: 'Eating' },
  { name: 'T6', state: 'Free' },
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
      <div className="mx-3 mt-3 motion-safe:tour-pop" style={tourAt(0.4)}>
        <div className="rounded-[12px] bg-haldi-soft p-2.5 ring-1 ring-haldi motion-safe:tour-hide motion-reduce:hidden" style={tourAt(2.4)}>
          <p className="text-[0.68rem] font-bold text-ink">1 table needs you</p>
          <div className="mt-1.5 flex items-center gap-2 rounded-[10px] bg-paper p-2 text-[0.65rem] text-ink">
            <BellRing className="size-3.5 text-ink-2" />
            <span className="flex-1">
              <b>Table T4</b> called a waiter · 0 min ago
            </span>
            <span className="rounded-control bg-indigo px-2 py-1 font-semibold text-white motion-safe:tour-tap" style={tourAt(2)}>
              Done
            </span>
          </div>
        </div>
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-2 px-3">
        {TABLES.map((table) => (
          <li key={table.name} className="relative rounded-[12px] bg-paper p-2.5 shadow-slip">
            <p className="flex justify-between text-[0.8rem] font-bold text-ink">
              {table.name} <span className="text-[0.58rem] font-normal text-ink-3">4 seats</span>
            </p>
            <span className={`mt-3 inline-block rounded-[5px] px-1.5 py-0.5 text-[0.58rem] font-semibold ${table.state === 'Free' ? 'bg-canvas text-ink-3' : 'bg-indigo-wash text-indigo'}`}>
              {table.state}
            </span>
            {table.name === 'T4' && (
              <span className="absolute inset-0 motion-safe:tour-pop motion-reduce:hidden" style={tourAt(0.4)}>
                <span className="block h-full rounded-[12px] bg-paper p-2.5 ring-2 ring-haldi motion-safe:tour-hide" style={tourAt(2.4)}>
                  <span className="flex justify-between text-[0.8rem] font-bold text-ink">
                    T4 <span className="text-[0.58rem] font-normal text-ink-3">4 seats</span>
                  </span>
                  <span className="mt-3 inline-block rounded-[5px] bg-haldi-soft px-1.5 py-0.5 text-[0.58rem] font-semibold text-ink">Waiter called</span>
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>

      {/* The calls pill floats over every page while a call is open. */}
      <span className="absolute end-3 bottom-[4.5rem] motion-safe:tour-pop motion-reduce:hidden" style={tourAt(0.4)}>
        <span className="flex items-center gap-1 rounded-full bg-haldi-deep px-2.5 py-1.5 text-[0.62rem] font-semibold text-white shadow-lift motion-safe:tour-hide" style={tourAt(2.4)}>
          <BellRing className="size-3" /> 1 guest call
        </span>
      </span>
      <StaffNav active="Home" />
    </div>
  );
}
