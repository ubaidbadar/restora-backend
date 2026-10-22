import SITE from '../constants/site';

/** Everything here is public; the sitemap says where it is. */
const robotsTxt = () => `User-Agent: *\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`;

export default robotsTxt;
