import type { ReactNode } from 'react';
import JsonLd from '../components/json_ld';
import SITE from '../constants/site';
import type PageData from '../types/page_data';
import type PageMeta from '../types/page_meta';
import type SiteAssets from '../types/site_assets';

const OG_IMAGE = `${SITE.url}/opengraph-image.png`;
const OG_ALT = `${SITE.name}: ${SITE.tagline}`;
const PRELOAD_FONTS = ['bricolage_grotesque', 'instrument_sans', 'plex_mono_400', 'plex_mono_600'];

/** Home › this page, so search results show where the page sits on the site. */
function breadcrumbOf(name: string, url: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: SITE.name, item: SITE.url },
      { '@type': 'ListItem', position: 2, name, item: url },
    ],
  };
}

interface DocumentProps {
  meta: PageMeta;
  assets: SiteAssets;
  /** Only pages that run in the browser (the demo form, a table's menu) get their props and the script. */
  data?: PageData;
  children: ReactNode;
}

/** The whole HTML page, rendered on the server only: the head every page shares, then the page in #root. */
export default function Document({ meta, assets, data, children }: DocumentProps) {
  const title = meta.title ? `${meta.title} | ${SITE.name}` : `${SITE.name}: ${SITE.tagline}`;
  const description = meta.description ?? SITE.description;
  // The page's own address: shares and search results point here, not to the home page.
  const url = meta.canonical ? `${SITE.url}${meta.canonical === '/' ? '' : meta.canonical}` : undefined;

  return (
    <html lang="en-PK">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <link rel="stylesheet" href={assets.css} />
        {PRELOAD_FONTS.map((font) => (
          <link key={font} rel="preload" href={`/fonts/${font}.woff2`} as="font" type="font/woff2" crossOrigin="" />
        ))}
        <meta name="theme-color" content="#EEF0F6" />
        <meta name="description" content={description} />
        <meta name="application-name" content={SITE.name} />
        {meta.noindex && <meta name="robots" content="noindex, nofollow" />}
        <link rel="manifest" href="/manifest.webmanifest" />
        {url && <link rel="canonical" href={url} />}
        <meta name="format-detection" content="telephone=no" />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        {url && <meta property="og:url" content={url} />}
        <meta property="og:site_name" content={SITE.name} />
        <meta property="og:locale" content="en_PK" />
        <meta property="og:image" content={OG_IMAGE} />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={OG_ALT} />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={title} />
        <meta name="twitter:description" content={description} />
        <meta name="twitter:image" content={OG_IMAGE} />
        <meta name="twitter:image:alt" content={OG_ALT} />
        <link rel="icon" href="/favicon.ico" sizes="48x48" type="image/x-icon" />
        <link rel="icon" href="/icon.svg" sizes="any" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180" type="image/png" />
        {/* The crumb is the title's first part: "Pricing", not the whole line. */}
        {url && meta.title && <JsonLd data={breadcrumbOf(meta.title.split(':')[0]!, url)} />}
        {/* The script comes after the first paint: low priority, so the CSS and fonts are not kept waiting. */}
        {data && assets.chunks.map((chunk) => <link key={chunk} rel="modulepreload" href={chunk} fetchPriority="low" />)}
      </head>
      <body className="min-h-dvh">
        <div id="root">{children}</div>
        {data && (
          <>
            <script id="page-data" type="application/json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
            <script type="module" src={assets.client} fetchPriority="low" />
          </>
        )}
      </body>
    </html>
  );
}
