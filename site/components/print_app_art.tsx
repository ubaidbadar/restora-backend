import RestoraSymbol from '../icons/restora_symbol';

const SLIP_LINES = [
  ['2', 'Chicken karahi (half)'],
  ['4', 'Roghni naan'],
  ['1', 'Raita'],
  ['2', 'Fresh lime'],
];

const PRINTERS = [
  ['Kitchen', 'EPSON TM-T20'],
  ['Counter', 'XP-80C receipt'],
];

/**
 * Restora Print at work: the app's small window on the counter PC, and the kitchen slip it just printed by itself.
 * Drawn, not a screenshot, so it stays sharp at any size. Shown on Home and on the download page.
 */
export default function PrintAppArt() {
  return (
    <div className="mx-auto w-full max-w-[32rem] pt-2">
      {/* The kitchen slip, coming out of the printer */}
      <div className="tear-bottom ms-auto w-[15.5rem] rotate-2 lg:w-[18.5rem] bg-paper px-5 pt-5 pb-8 font-slip text-[0.8rem] leading-[1.65] text-ink shadow-[0_1px_2px_rgb(18_21_46/0.1),0_10px_22px_-10px_rgb(18_21_46/0.4)] sm:w-[17rem]">
        <p className="text-center font-semibold tracking-wide">KITCHEN</p>
        <p className="text-center font-display text-4xl leading-tight font-extrabold">#24</p>
        <p className="text-center text-ink-3">Table 4 · Dine-in · 9:14 pm</p>
        <div aria-hidden="true" className="my-3 border-t-2 border-dashed border-ink/25" />
        <ul>
          {SLIP_LINES.map(([qty, name]) => (
            <li key={name} className="flex gap-3">
              <span className="w-4 shrink-0 text-end font-semibold">{qty}</span>
              <span>{name}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-ink-3">Note: less spicy</p>
      </div>

      {/* The app's window on the counter PC */}
      <div className="relative -mt-10 w-[16.5rem] -rotate-1 lg:w-[19rem] rounded-[14px] bg-paper p-4 text-[0.78rem] text-ink shadow-[0_1px_2px_rgb(23_19_74/0.12),0_12px_24px_-8px_rgb(23_19_74/0.3)] sm:w-[18rem]">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-[7px] bg-indigo text-white">
            <RestoraSymbol className="size-[1.1rem]" />
          </span>
          <span className="font-semibold">Restora Print</span>
          <span className="ms-auto inline-flex items-center gap-1.5 rounded-full bg-leaf-soft px-2 py-0.5 text-[0.68rem] font-semibold text-leaf">
            <span className="size-1.5 rounded-full bg-leaf" />
            Connected
          </span>
        </div>
        <ul className="mt-3 flex flex-col gap-1.5">
          {PRINTERS.map(([role, name]) => (
            <li key={role} className="flex items-center gap-2 rounded-[8px] bg-canvas px-2.5 py-1.5">
              <span className="font-semibold">{role}</span>
              <span className="min-w-0 flex-1 truncate text-ink-3">{name}</span>
              <span className="text-leaf">Ready</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-ink-3">Printed #24 for Table 4 · just now</p>
      </div>
    </div>
  );
}
