import { BellRing, Footprints } from 'lucide-react';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

/** The hall, as the Tables screen draws it: who is seated and who is free. */
const TABLES = [
  { name: 'T1', busy: true },
  { name: 'T2', busy: false },
  { name: 'T3', busy: true },
  { name: 'T4', busy: true },
  { name: 'T5', busy: false },
  { name: 'T6', busy: true },
  { name: 'T7', busy: false },
  { name: 'T8', busy: true },
  { name: 'T9', busy: true },
];

/** Step 4, on a waiter's phone: table 4 taps Call waiter, the call shows on every page, and Bilal takes it. */
export default function TablesScene() {
  return (
    <div className="relative flex h-full flex-col bg-canvas">
      <StatusBar time="7:31" />
      {/* The call, at the top of whatever screen the waiter is on; then who is going. */}
      <div className="mx-3 mt-1 grid">
        <div className="[grid-area:1/1] rounded-[14px] bg-haldi text-ink motion-safe:tour-pop motion-reduce:hidden" style={tourAt(0.4)}>
          <div className="flex items-center gap-2.5 p-3 motion-safe:tour-hide" style={tourAt(2.2)}>
            <BellRing className="size-5 shrink-0" />
            <span className="flex-1">
              <span className="block text-[0.85rem] font-semibold">Table 4 is calling a waiter</span>
              <span className="block text-[0.7rem]">Just now</span>
            </span>
            <span className="rounded-control bg-ink px-2.5 py-1.5 text-[0.7rem] font-semibold text-white motion-safe:tour-tap" style={tourAt(1.8)}>
              I&apos;ll go
            </span>
          </div>
        </div>
        <div className="[grid-area:1/1] flex items-center gap-2.5 rounded-[14px] bg-leaf p-3 text-white motion-safe:tour-pop" style={tourAt(2.2)}>
          <Footprints className="size-5 shrink-0" />
          <span className="flex-1">
            <span className="block text-[0.85rem] font-semibold">Bilal is going to table 4</span>
            <span className="block text-[0.7rem] opacity-80">Everyone else sees it is taken</span>
          </span>
        </div>
      </div>

      <div className="flex items-baseline justify-between px-5 pt-5">
        <p className="font-display text-xl font-bold tracking-tight text-ink">Tables</p>
        <span className="text-[0.75rem] text-ink-3">Hall · 6 of 9 seated</span>
      </div>
      <ul className="mt-3 grid grid-cols-3 gap-2.5 px-4">
        {TABLES.map((table) => (
          <li
            key={table.name}
            className={`relative grid aspect-square place-items-center rounded-[16px] font-display text-lg font-bold ${table.busy ? 'bg-indigo-wash text-indigo' : 'border-2 border-dashed border-rule text-ink-3'}`}
          >
            {table.name}
            {table.name === 'T4' && (
              <span className="absolute -end-1 -top-1 motion-safe:tour-pop" style={tourAt(0.4)}>
                <span className="grid size-7 place-items-center rounded-full bg-haldi text-ink motion-safe:tour-ring" style={tourAt(0.4)}>
                  <BellRing className="size-3.5" />
                </span>
              </span>
            )}
          </li>
        ))}
      </ul>
      <p className="mt-auto mb-5 px-5 text-[0.7rem] text-ink-3">Guests can also ask for the bill from their phone.</p>
    </div>
  );
}
