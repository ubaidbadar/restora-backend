import { Play } from 'lucide-react';
import Button from '../../ui/button';
import ClosingCta from '../../components/closing_cta';
import FeatureBento from './feature_bento';
import FaqList from '../../components/faq_list';
import JsonLd from '../../components/json_ld';
import KhataCompare from './khata_compare';
import PriceSlip from '../../components/price_slip';
import HeroStage from './hero_stage';
import OrderTour from './order_tour';
import ProductShots from './product_shots';
import FAQS from '../../constants/faqs';
import SITE from '../../constants/site';
import appLink from '../../utils/app_link';
import whatsappLink from '../../utils/whatsapp_link';

const FOR_HERE = [
  { title: 'Load-shedding and slow data', text: 'Orders are saved on the phone when the connection drops and sent when it is back.' },
  { title: 'Khata customers', text: 'Bills on khata, part payments, and a statement on WhatsApp.' },
  { title: 'JazzCash, Easypaisa, cash and card', text: 'Every way your customers pay, with tax set per payment method.' },
  { title: 'Phones you already own', text: 'Android, iPhone, tablet or laptop. No till to buy, nothing to install on a PC.' },
  { title: 'Waiters, not IT staff', text: 'Tables, orders and calls on their own phone, with only what their role needs.' },
  { title: 'Families, regulars and big tables', text: 'Bookings for the evening, and the regulars who haven\'t been back, on WhatsApp.' },
];

/** restora.live: the hero, how an order goes through Restora, everything else, khata, the real app, the price, questions. */
export default function HomePage() {
  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            { '@type': 'WebSite', '@id': `${SITE.url}/#website`, name: SITE.name, url: SITE.url, inLanguage: 'en-PK', publisher: { '@id': `${SITE.url}/#organization` } },
            { '@type': 'Organization', '@id': `${SITE.url}/#organization`, name: SITE.name, url: SITE.url, logo: `${SITE.url}/apple-icon.png`, email: SITE.email, contactPoint: { '@type': 'ContactPoint', telephone: `+${SITE.whatsapp}`, contactType: 'customer support', areaServed: 'PK', availableLanguage: ['en', 'ur'] } },
            { '@type': 'SoftwareApplication', name: SITE.name, url: SITE.url, applicationCategory: 'BusinessApplication', operatingSystem: 'Web, Android, iOS', description: SITE.description, publisher: { '@id': `${SITE.url}/#organization` }, offers: { '@type': 'Offer', price: '0', priceCurrency: 'PKR', url: `${SITE.url}/pricing` } },
            { '@type': 'FAQPage', mainEntity: FAQS.map((faq) => ({ '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a } })) },
          ],
        }}
      />

      {/* The hero: the headline, and the owner's phone with the restaurant's evening arriving around it. */}
      <section className="mx-auto grid max-w-[76rem] items-center gap-14 px-5 pt-12 pb-20 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:pt-16 lg:pb-28">
        <div>
          <a href="#tour" className="inline-flex items-center gap-2 rounded-full bg-paper py-1.5 ps-1.5 pe-4 text-sm font-semibold text-ink shadow-slip hover:text-indigo">
            <span className="rounded-full bg-haldi px-2.5 py-0.5 text-ink">New</span>
            Guests now order from their table
          </a>
          <h1 className="display mt-7 text-[clamp(3.25rem,8.5vw,7rem)] text-ink">Run your restaurant from your phone.</h1>
          <p className="mt-7 max-w-xl text-xl text-ink-2">
            Guests order from their table, the orders board updates live on every phone, and the day adds itself up. Khata, bookings and WhatsApp too. It keeps working when the internet doesn&apos;t, and it is free.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <Button as="a" href={appLink('/signup', 'home-hero')} size="lg">
              Start free
            </Button>
            <Button as="a" href="#tour" size="lg" variant="outline">
              <Play className="size-4 fill-current" aria-hidden="true" />
              See how it works
            </Button>
          </div>
          <p className="mt-5 text-sm text-ink-3">
            No card, no till to buy. Or{' '}
            <a href={whatsappLink()} target="_blank" rel="noopener" className="font-semibold text-indigo underline decoration-2 underline-offset-4">
              ask us on WhatsApp
            </a>
            .
          </p>
        </div>
        <HeroStage />
      </section>

      <OrderTour />

      {/* Everything else, as tiles */}
      <section className="mx-auto max-w-[76rem] px-5 py-24 sm:px-8 lg:py-32">
        <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
          <h2 className="display text-[clamp(2.6rem,6vw,4.75rem)]">Everything else a busy night needs.</h2>
          <p className="max-w-md text-lg text-ink-2 lg:justify-self-end">Bookings, the counter, the team and every branch, in the same app your waiters already know.</p>
        </div>
        <div className="mt-14">
          <FeatureBento />
        </div>
      </section>

      {/* Khata */}
      <section className="mx-auto grid max-w-[76rem] items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-32">
        <div>
          <h2 className="display text-[clamp(2.6rem,6vw,4.75rem)]">Close the khata register.</h2>
          <p className="mt-6 max-w-md text-lg text-ink-2">
            Put a bill on a customer&apos;s khata in one tap. Take part payments in cash or JazzCash. When they ask how much, send their statement on WhatsApp instead of turning pages.
          </p>
        </div>
        <KhataCompare />
      </section>

      {/* The real app */}
      <section className="bg-paper">
        <div className="mx-auto max-w-[76rem] px-5 pt-24 pb-32 sm:px-8 lg:pt-32 lg:pb-40">
          <div className="grid gap-6 lg:grid-cols-[1fr_1fr] lg:items-end">
            <h2 className="display text-[clamp(2.6rem,6vw,4.75rem)]">This is the app, not a drawing of it.</h2>
            <p className="max-w-md text-lg text-ink-2 lg:justify-self-end">The owner&apos;s screen at Lahori Karahi House: today&apos;s sales, cash against digital, and the regulars who have not been back in a month.</p>
          </div>
          <div className="mt-14 lg:mx-10">
            <ProductShots />
          </div>
        </div>
      </section>

      {/* Made for here */}
      <section className="mx-auto max-w-[76rem] px-5 py-24 sm:px-8 lg:py-32">
        <h2 className="display max-w-3xl text-[clamp(2.6rem,6vw,4.75rem)]">Made for how restaurants here really work.</h2>
        <dl className="mt-14 grid gap-x-12 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {FOR_HERE.map((item) => (
            <div key={item.title} className="border-t-[3px] border-ink pt-5">
              <dt className="text-xl font-semibold tracking-tight">{item.title}</dt>
              <dd className="mt-2 text-ink-2">{item.text}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-14 text-lg">
          <a href="/features" className="font-semibold text-indigo underline decoration-2 underline-offset-[6px] hover:text-indigo-deep">
            Everything Restora does
          </a>
        </p>
      </section>

      {/* Price, as a bill */}
      <section className="bg-haldi">
        <div className="mx-auto grid max-w-[76rem] items-center gap-14 px-5 py-24 sm:px-8 lg:grid-cols-2 lg:py-32">
          <div>
            <h2 className="display text-[clamp(2.6rem,6vw,4.75rem)] text-ink">Free while we grow.</h2>
            <p className="mt-6 max-w-md text-lg text-ink">
              Every feature, every branch, every member of staff. If paid plans ever come, you will hear from us long before, and your data stays yours.
            </p>
            <div className="mt-8">
              <Button as="a" href={appLink('/signup', 'home-price')} size="lg">
                Start free
              </Button>
            </div>
          </div>
          <PriceSlip />
        </div>
      </section>

      {/* Questions */}
      <section className="mx-auto grid max-w-[76rem] gap-12 px-5 py-24 sm:px-8 lg:grid-cols-[0.8fr_1.2fr] lg:py-32">
        <div>
          <h2 className="display text-[clamp(2.6rem,6vw,4.75rem)]">Questions owners ask.</h2>
          <p className="mt-6 max-w-sm text-lg text-ink-2">
            Anything else, ask on{' '}
            <a href={whatsappLink()} target="_blank" rel="noopener" className="font-semibold text-indigo underline decoration-2 underline-offset-4">
              WhatsApp
            </a>
            .
          </p>
        </div>
        <FaqList />
      </section>

      <ClosingCta from="home-end" />
    </>
  );
}
