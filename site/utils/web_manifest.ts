import SITE from '../constants/site';

/** Name, colors and icon when the site is added to a home screen. */
const webManifest = () =>
  JSON.stringify({
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: '/',
    display: 'browser',
    background_color: '#F6F7F9',
    theme_color: '#4F46E5',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' }],
  });

export default webManifest;
