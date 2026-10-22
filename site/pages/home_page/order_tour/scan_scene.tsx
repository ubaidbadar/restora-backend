import QrArt from '../qr_art';
import StatusBar from './status_bar';
import tourAt from '../../../utils/tour_at';

/** Step 1, on the guest's phone: the camera finds the code on table 4, and the restaurant's menu is offered. */
export default function ScanScene() {
  return (
    <div className="flex h-full flex-col bg-night">
      <StatusBar time="7:02" light />
      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        {/* The table tent seen through the camera, with the scan line sweeping over the code. */}
        <div className="relative rounded-[18px] bg-paper p-5 shadow-lift">
          <QrArt className="size-36 text-ink" />
          <p className="mt-3 text-center text-[0.7rem] font-semibold text-ink-3">TABLE 4 · Scan for the menu</p>
          <span aria-hidden="true" className="absolute inset-x-3 h-0.5 rounded-full bg-haldi shadow-[0_0_14px_2px_var(--color-haldi)] motion-safe:tour-scan" style={{ top: '12%' }} />
          {(['start-0 top-0 border-s-4 border-t-4', 'end-0 top-0 border-e-4 border-t-4', 'start-0 bottom-0 border-s-4 border-b-4', 'end-0 bottom-0 border-e-4 border-b-4'] as const).map((corner) => (
            <span key={corner} aria-hidden="true" className={`absolute -m-2 size-7 rounded-[6px] border-haldi ${corner}`} />
          ))}
        </div>
        <p className="text-center text-[0.8rem] text-moon">Point the camera at the code on the table</p>
      </div>
      {/* Found: the camera offers the menu. */}
      <div className="m-3 rounded-[18px] bg-paper p-4 motion-safe:tour-pop" style={tourAt(2)}>
        <p className="text-[0.7rem] font-semibold text-ink-3">restora.live</p>
        <p className="mt-0.5 font-semibold text-ink">Lahori Karahi House · Table 4</p>
        <p className="mt-3 rounded-control bg-indigo py-2 text-center text-[0.85rem] font-semibold text-white">Open the menu</p>
      </div>
    </div>
  );
}
