import { ClipboardList, LayoutGrid, Menu, Plus, Users } from 'lucide-react';

const TABS = [
  { label: 'Home', icon: LayoutGrid },
  { label: 'Orders', icon: ClipboardList },
  { label: 'Customers', icon: Users },
  { label: 'More', icon: Menu },
];

/** The bar's top edge as the app draws it (restora-web bottom_nav): 112 wide, dipping round the round "+". */
const EDGE = 'M0 0H16.2A6 6 0 0 1 22.17 5.4A34 34 0 0 0 89.83 5.4A6 6 0 0 1 95.8 0H112';

/**
 * The app's bottom bar on a staff phone, as it looks today: four tabs and the round New order button raised into a
 * cut-out in the middle of the bar, drawn at two thirds of the app's size to fit the drawn phone.
 */
export default function StaffNav({ active }: { active: string }) {
  return (
    <div className="relative mt-auto grid h-[3.4rem] shrink-0 grid-cols-5 pb-2 text-[0.55rem] font-medium text-ink-3">
      {/* The bar's background, cut out round the "+": the screen shows through the cut. */}
      <div aria-hidden="true" className="absolute inset-0 flex">
        <div className="flex-1 border-t border-rule bg-paper" />
        <div className="-mx-px flex w-[75px] shrink-0 flex-col">
          <svg width="75" height="43" viewBox="0 0 112 64" className="block shrink-0">
            <g transform="translate(0 .5)">
              <path d={`${EDGE}V64H0Z`} className="fill-paper" />
              <path d={EDGE} className="fill-none stroke-rule" strokeWidth={1.5} />
            </g>
          </svg>
          <div className="flex-1 bg-paper" />
        </div>
        <div className="flex-1 border-t border-rule bg-paper" />
      </div>
      {TABS.slice(0, 2).map((tab) => (
        <Tab key={tab.label} {...tab} active={tab.label === active} />
      ))}
      <span className="relative">
        <span className="absolute start-1/2 -top-[17px] grid size-[2.35rem] -translate-x-1/2 place-items-center rounded-full bg-indigo text-white shadow-[0_6px_14px_-6px_rgb(79_70_229/0.7)] rtl:translate-x-1/2">
          <Plus className="size-[1.1rem]" />
        </span>
      </span>
      {TABS.slice(2).map((tab) => (
        <Tab key={tab.label} {...tab} active={tab.label === active} />
      ))}
    </div>
  );
}

function Tab({ label, icon: Icon, active }: { label: string; icon: typeof Plus; active: boolean }) {
  return (
    <span className={`relative flex flex-col items-center justify-center gap-0.5 ${active ? 'text-indigo' : ''}`}>
      <span className={`grid h-[1.35rem] w-9 place-items-center rounded-full ${active ? 'bg-indigo-wash' : ''}`}>
        <Icon className="size-[0.95rem]" />
      </span>
      {label}
    </span>
  );
}
