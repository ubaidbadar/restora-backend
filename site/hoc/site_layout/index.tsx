import type { ReactNode } from 'react';
import MobileCtaBar from './mobile_cta_bar';
import SiteFooter from './site_footer';
import SiteHeader from './site_header';

/** Every marketing page: header, the page, footer, and on phones the Start free bar (with room left for it). */
export default function SiteLayout({ path, children }: { path: string; children: ReactNode }) {
  return (
    <>
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:start-2 focus:z-50 focus:rounded-control focus:bg-paper focus:px-4 focus:py-2">
        Skip to content
      </a>
      <SiteHeader path={path} />
      <main id="main">
        {children}
      </main>
      <SiteFooter />
      <div className="h-20 bg-night md:hidden" aria-hidden="true" />
      <MobileCtaBar />
    </>
  );
}
