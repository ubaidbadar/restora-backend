import { ClipboardList, LayoutGrid, Menu, Plus, Users } from 'lucide-react';

const TABS = [
  { label: 'Home', icon: LayoutGrid },
  { label: 'Orders', icon: ClipboardList },
  { label: 'Customers', icon: Users },
  { label: 'More', icon: Menu },
];

/** The app's tab bar on a staff phone, as it looks, with the New order button in the middle. */
export default function StaffNav({ active }: { active: string }) {
  return (
    <div className="mt-auto flex items-center justify-around border-t border-rule bg-paper px-2 pt-1.5 pb-4 text-[0.58rem] font-medium text-ink-3">
      {TABS.slice(0, 2).map((tab) => (
        <Tab key={tab.label} {...tab} active={tab.label === active} />
      ))}
      <span className="-mt-5 grid size-11 place-items-center rounded-[14px] bg-indigo text-white shadow-lift">
        <Plus className="size-5" />
      </span>
      {TABS.slice(2).map((tab) => (
        <Tab key={tab.label} {...tab} active={tab.label === active} />
      ))}
    </div>
  );
}

function Tab({ label, icon: Icon, active }: { label: string; icon: typeof Plus; active: boolean }) {
  return (
    <span className={`flex flex-col items-center gap-0.5 ${active ? 'text-indigo' : ''}`}>
      <span className={`grid h-6 w-10 place-items-center rounded-full ${active ? 'bg-indigo-wash' : ''}`}>
        <Icon className="size-4" />
      </span>
      {label}
    </span>
  );
}
