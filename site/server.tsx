import { Hono, type Context } from 'hono';
import path from 'path';
import type { ComponentType, ReactNode } from 'react';
import { renderToReadableStream } from 'react-dom/server';
import publicMenuController, { findPublicMenu } from '../src/controllers/public_menu';
import ROUTES from './constants/routes';
import Document from './hoc/document';
import SiteLayout from './hoc/site_layout';
import NotFoundPage from './pages/not_found_page';
import TableNotFoundPage from './pages/table_not_found_page';
import TablePage from './pages/table_page';
import type PageData from './types/page_data';
import type PageMeta from './types/page_meta';
import type SiteAssets from './types/site_assets';
import llmsTxt from './utils/llms_txt';
import robotsTxt from './utils/robots_txt';
import sitemapXml from './utils/sitemap_xml';
import webManifest from './utils/web_manifest';

/**
 * restora.live, rendered by this server: every page is React rendered to HTML here, with its data already in it.
 * Marketing pages are plain HTML (rendered once, then served from memory); the demo form and a table's menu also
 * hydrate in the browser. Answers only for the site's hosts (SITE_HOSTS), so restora.live stays the API.
 */
const site = new Hono();

const DIST = path.join(import.meta.dir, 'dist');
const PUBLIC = path.join(import.meta.dir, 'public');
const HOSTS = (process.env.SITE_HOSTS || 'restora.live,www.restora.live,dev.restora.live').split(',').map((host) => host.trim());
const IMMUTABLE = 'public, max-age=31536000, immutable';

// Built by `bun run build` (site/build.ts). Read once; the deploy restarts the server with a new build.
let assets: SiteAssets | undefined;
let assetsPromise: Promise<SiteAssets> | undefined;

const getAssets = async (): Promise<SiteAssets> => {
  if (assets) return assets;
  if (!assetsPromise) {
    assetsPromise = (async (): Promise<SiteAssets> => {
      const manifestPath = path.join(DIST, 'manifest.json');
      if (!(await Bun.file(manifestPath).exists())) {
        const proc = Bun.spawn([process.execPath || 'bun', path.join(import.meta.dir, 'build.ts')], {
          stdout: 'inherit',
          stderr: 'inherit',
        });
        await proc.exited;
      }
      const data = (await Bun.file(manifestPath).json()) as SiteAssets;
      assets = data;
      return data;
    })().catch((err) => {
      assetsPromise = undefined;
      throw err;
    });
  }
  return await assetsPromise;
};

// Locally every host is the site; in production only the site's own hosts are.
const isSite = (c: Context) => process.env.NODE_ENV !== 'production' || HOSTS.includes((c.req.header('host') ?? '').split(':')[0]!);

async function renderHtml(meta: PageMeta, body: ReactNode, data?: PageData) {
  const stream = await renderToReadableStream(
    <Document meta={meta} assets={await getAssets()} data={data}>
      {body}
    </Document>
  );
  await stream.allReady;
  return new Response(stream).text();
}

const html = (c: Context, body: string, status: 200 | 404, cache: string) => c.html(body, status, { 'Cache-Control': cache });

// Marketing pages never change between deploys: each is rendered once, on its first visit.
const rendered = new Map<string, string>();

for (const route of ROUTES) {
  site.get(route.path, async (c) => {
    if (!isSite(c)) return c.notFound();
    let page = rendered.get(route.path);
    if (!page) {
      const Page: ComponentType = (await route.load()).default;
      page = await renderHtml(
        route.meta,
        <SiteLayout path={route.path}>
          <Page />
        </SiteLayout>,
        route.hydrate ? { page: route.page, path: route.path, layout: true, props: {} } : undefined
      );
      rendered.set(route.path, page);
    }
    return html(c, page, 200, 'public, max-age=0, must-revalidate');
  });
}

// A table's menu, read from the database while the page renders: fresh on every visit (sold-out dishes change). Its
// link is /t/:restaurant/:table (tables made before that: /t/:code, still printed on cards).
const tablePage = async (c: Context) => {
  if (!isSite(c)) return c.notFound();
  const code = c.req.param('code') ?? `${c.req.param('restaurant')}/${c.req.param('table')}`;
  const menu = await findPublicMenu(code);
  if (typeof menu === 'string') {
    return html(c, await renderHtml({ title: 'Menu', noindex: true }, <TableNotFoundPage />), 404, 'no-store');
  }
  const props = { code, menu };
  return html(c, await renderHtml({ title: 'Menu', noindex: true }, <TablePage {...props} />, { page: 'table_page', path: c.req.path, layout: false, props }), 200, 'no-store');
};
site.get('/t/:code/stream', publicMenuController.stream);
site.get('/t/:restaurant/:table/stream', publicMenuController.stream);
site.get('/t/:code/orders', publicMenuController.getOrders);
site.get('/t/:restaurant/:table/orders', publicMenuController.getOrders);
site.get('/t/:code', tablePage);
site.get('/t/:restaurant/:table', tablePage);

const text = (type: string, make: () => string) => (c: Context) => (isSite(c) ? c.body(make(), 200, { 'Content-Type': type, 'Cache-Control': 'public, max-age=0, must-revalidate' }) : c.notFound());
site.get('/robots.txt', text('text/plain; charset=utf-8', robotsTxt));
site.get('/sitemap.xml', text('application/xml; charset=utf-8', sitemapXml));
site.get('/manifest.webmanifest', text('application/manifest+json; charset=utf-8', webManifest));
site.get('/llms.txt', text('text/plain; charset=utf-8', llmsTxt));

// Files. Built assets have their hash in the name and fonts never change, so both are cached for a year.
const STATIC_TYPES: Record<string, string> = {
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const serveFile = (root: string, cache: (name: string) => string) => async (c: Context) => {
  if (!isSite(c)) return c.notFound();
  // Normalized first, so a path can never climb out of its folder.
  const name = path.normalize(c.req.path);
  const type = STATIC_TYPES[path.extname(name)];
  const file = Bun.file(path.join(root, name));
  if (!type || !(await file.exists())) return c.notFound();
  return new Response(file, { headers: { 'Content-Type': type, 'Cache-Control': cache(name), 'X-Content-Type-Options': 'nosniff' } });
};
site.get('/assets/*', serveFile(DIST, () => IMMUTABLE));
site.get('/fonts/*', serveFile(PUBLIC, () => IMMUTABLE));
site.get('/screenshots/*', serveFile(PUBLIC, () => 'public, max-age=86400'));
for (const file of ['/icon.svg', '/apple-icon.png', '/favicon.ico', '/opengraph-image.png']) site.get(file, serveFile(PUBLIC, () => 'public, max-age=86400'));

// Anything else on the site's hosts: the site's own 404 page.
site.get('*', async (c) => {
  if (!isSite(c)) return c.notFound();
  return html(c, await renderHtml({ noindex: true }, <NotFoundPage />), 404, 'no-store');
});

export default site;
