import ROUTES from '../constants/routes';
import SITE from '../constants/site';

/** Every public page, for search engines (restora.live/sitemap.xml). */
export default function sitemapXml() {
  const urls = ROUTES.map(({ path }) =>
    path === '/'
      ? `<url>\n<loc>${SITE.url}</loc>\n<changefreq>weekly</changefreq>\n<priority>1</priority>\n</url>`
      : `<url>\n<loc>${SITE.url}${path}</loc>\n<changefreq>monthly</changefreq>\n<priority>0.7</priority>\n</url>`
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
