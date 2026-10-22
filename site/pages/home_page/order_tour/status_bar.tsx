import { BatteryFull, Signal, Wifi } from 'lucide-react';

/** The top of a phone screen in the tour: the time of the evening the step happens, and full bars. */
export default function StatusBar({ time, light = false }: { time: string; light?: boolean }) {
  return (
    <div className={`flex items-center justify-between px-6 pt-3.5 pb-2 text-[0.72rem] font-semibold tabular-nums ${light ? 'text-white' : 'text-ink'}`}>
      <span>{time}</span>
      <span className="flex items-center gap-1">
        <Signal className="size-3.5" />
        <Wifi className="size-3.5" />
        <BatteryFull className="size-4" />
      </span>
    </div>
  );
}
