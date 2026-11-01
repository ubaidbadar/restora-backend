import { Download, ShieldCheck } from 'lucide-react';
import Button from '../../ui/button';
import PageIntro from '../../components/page_intro';
import PrintAppArt from '../../components/print_app_art';
import SITE from '../../constants/site';
import WhatsappIcon from '../../icons/whatsapp_icon';
import appLink from '../../utils/app_link';
import whatsappLink from '../../utils/whatsapp_link';

const PRINT_POINTS = [
  'Kitchen slips print the moment an order comes in, from the counter or from a guest at the table',
  'Orders taken on the PC while the internet is down still print',
  'Receipts carry your restaurant’s logo',
  'Changed and cancelled orders print a clear slip for the kitchen',
  'Any printer Windows can see: receipt, USB or network',
];

const STEPS = [
  { title: 'Download and open it', text: 'On the PC at the counter or in the kitchen. Restora Print sits in the tray next to the clock.' },
  { title: 'Connect it to your restaurant', text: 'Click Connect to Restora and sign in. It connects by itself. Or type the 6-digit code from Settings, then Printers.' },
  { title: 'Choose your printers', text: 'Pick the printer for kitchen slips and the one for receipts. From then on, slips print by themselves.' },
];

const DEVICES = [
  { title: 'Laptop or computer', text: 'Open app.restora.live in Chrome, Edge or Safari. Best for the counter and the owner.', ready: true },
  { title: 'Tablet', text: 'The same web app, made for touch, with the menu and the order side by side.', ready: true },
  { title: 'Android and iPhone', text: 'The Restora app for waiters and managers on the floor, with offline orders and QR table scanning.', ready: false },
];

/** Everything to download: Restora Print for the counter PC first (it is the one thing to install), then the apps. */
export default function DownloadPage() {
  return (
    <>
      <PageIntro title="Download Restora.">
        <p>Restora runs in any browser. Add Restora Print to the counter PC, and every kitchen slip prints by itself.</p>
      </PageIntro>

      {/* Restora Print for Windows */}
      <section id="print" className="scroll-mt-24">
        <div className="mx-auto max-w-[76rem] px-5 sm:px-8">
          <div className="grid items-center gap-14 border-t-[3px] border-ink pt-14 pb-20 lg:grid-cols-[1.05fr_0.95fr] lg:pb-24">
            <div>
              <p className="text-sm font-semibold text-indigo">For Windows PCs · Free</p>
              <h2 className="display mt-3 text-[clamp(2.6rem,6vw,4.25rem)]">Restora Print</h2>
              <p className="mt-5 max-w-xl text-lg text-ink-2">A small app for the PC your printers are plugged into. Nobody has to press print: every order goes to the kitchen on its own.</p>
              <ul className="mt-7 flex max-w-xl flex-col divide-y divide-rule border-y border-rule">
                {PRINT_POINTS.map((point) => (
                  <li key={point} className="py-3 text-ink">
                    {point}
                  </li>
                ))}
              </ul>
              <div className="mt-8 flex flex-col items-start gap-3">
                <Button as="a" href={SITE.printAppUrl} size="lg" className="w-full sm:w-auto">
                  <Download className="size-5" aria-hidden="true" />
                  Download for Windows
                </Button>
                <p className="text-sm text-ink-3">Windows 10 or 11 · about 10 MB · restora-pc-agent.exe</p>
              </div>
            </div>
            <PrintAppArt />
          </div>
        </div>
      </section>

      {/* Setting it up */}
      <section className="bg-paper">
        <div className="mx-auto max-w-[76rem] px-5 py-20 sm:px-8 lg:py-24">
          <h2 className="display max-w-3xl text-[clamp(2.2rem,5vw,3.5rem)]">Set up in three steps.</h2>
          <ol className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <li key={step.title} className="border-t-[3px] border-ink pt-5">
                <p className="font-display text-4xl font-bold text-indigo">{index + 1}</p>
                <h3 className="mt-3 text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="mt-2 text-ink-2">{step.text}</p>
              </li>
            ))}
          </ol>
          <div className="mt-12 flex max-w-3xl gap-3 rounded-panel bg-canvas p-5 text-ink-2 sm:p-6">
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-ink" aria-hidden="true" />
            <p>
              <span className="font-semibold text-ink">If Windows says it protected your PC,</span> click <span className="font-semibold text-ink">More info</span>, then{' '}
              <span className="font-semibold text-ink">Run anyway</span>. Windows shows this for new apps it has not seen often. Stuck?{' '}
              <a href={whatsappLink(`Hi Restora, I need help setting up Restora Print. (${SITE.url}/download)`)} target="_blank" rel="noopener" className="font-semibold text-indigo underline decoration-2 underline-offset-4">
                We set it up with you on WhatsApp
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      {/* The app itself */}
      <section className="mx-auto max-w-[76rem] px-5 py-20 sm:px-8 lg:py-24">
        <h2 className="display max-w-3xl text-[clamp(2.2rem,5vw,3.5rem)]">The app, on the devices you have.</h2>
        <div className="mt-12 grid gap-x-12 gap-y-10 md:grid-cols-3">
          {DEVICES.map((device) => (
            <div key={device.title} className="border-t-[3px] border-ink pt-5">
              <p className={`text-sm font-semibold ${device.ready ? 'text-leaf' : 'text-chili'}`}>{device.ready ? 'Ready now' : 'Coming soon'}</p>
              <h3 className="mt-2 text-2xl font-semibold tracking-tight">{device.title}</h3>
              <p className="mt-2 text-ink-2">{device.text}</p>
            </div>
          ))}
        </div>
        <div className="mt-14 flex flex-col gap-3 sm:flex-row">
          <Button as="a" href={appLink('/signup', 'download')} size="lg">
            Open Restora in your browser
          </Button>
          <Button as="a" href={whatsappLink(`Hi Restora, please tell me when the phone app is out. (${SITE.url}/download)`)} target="_blank" rel="noopener" size="lg" variant="outline">
            <WhatsappIcon className="size-5" />
            Tell me when the app is out
          </Button>
        </div>
      </section>
    </>
  );
}
