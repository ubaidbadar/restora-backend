import PhoneIsland from '../../components/phone_island';
import StatusBar from './order_tour/status_bar';

/**
 * The real app, not a mock-up: the web app on a laptop and the same screen on a phone beside it. Screenshots from the
 * demo restaurant, in the sizes a screen needs (public/screenshots); replace them there when the app changes.
 */
export default function ProductShots() {
  return (
    <div className="relative">
      {/* On a phone screen the laptop would be too small to read, so only the phone shows, at a readable size. */}
      <div className="hidden overflow-hidden rounded-[14px] bg-paper shadow-lift ring-1 ring-ink/10 sm:block">
        <div aria-hidden="true" className="flex h-8 items-center gap-1.5 border-b border-rule px-3.5">
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="size-2.5 rounded-full bg-rule" />
          <span className="ms-3 rounded-full bg-canvas px-3 py-0.5 text-[0.7rem] text-ink-3">app.restora.live</span>
        </div>
        <img
          src="/screenshots/dashboard-wide-1280.webp"
          srcSet="/screenshots/dashboard-wide-640.webp 640w, /screenshots/dashboard-wide-860.webp 860w, /screenshots/dashboard-wide-1280.webp 1280w"
          sizes="(min-width: 1024px) 860px, 100vw"
          alt="Restora on a laptop: today's sales, orders by type, cash and digital payments, and customers who have not come back"
          width={1280}
          height={800}
          loading="lazy"
          decoding="async"
          className="h-auto w-full"
        />
      </div>
      {/* The same phone as the rest of the page: the screenshot under the phone's own status bar and camera island. */}
      <div className="phone relative mx-auto w-[78%] max-w-72 sm:absolute sm:-end-8 sm:-bottom-10 sm:w-[28%] sm:max-w-60">
        <PhoneIsland />
        <div className="phone-screen bg-canvas">
          <StatusBar time="8:47" />
          <img
            src="/screenshots/dashboard-narrow-780.webp"
            srcSet="/screenshots/dashboard-narrow-240.webp 240w, /screenshots/dashboard-narrow-480.webp 480w, /screenshots/dashboard-narrow-780.webp 780w"
            sizes="(min-width: 640px) 240px, 78vw"
            alt="The same screen on a phone, with the tab bar and the round New order button"
            width={780}
            height={1688}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full"
          />
        </div>
      </div>
    </div>
  );
}
