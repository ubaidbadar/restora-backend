import type SiteRoute from '../types/site_route';
import SITE from './site';

/** Every page of the site. The table's menu is not here: it loads its data per request (see site/server.tsx). */
const ROUTES: SiteRoute[] = [
  { path: '/', page: 'home_page', load: () => import('../pages/home_page'), meta: { description: 'Restaurant software for Pakistan: QR ordering at the table, a live orders board, khata, bookings and WhatsApp in one app. Works offline. Free, no card needed.', canonical: '/' } },
  {
    path: '/features',
    page: 'features_page',
    load: () => import('../pages/features_page'),
    meta: { title: 'Restaurant POS features: orders, QR tables, khata', description: 'Orders, QR ordering at the table, automatic kitchen printing, deals, order history, themes and dark mode, reservations, khata, offline orders, a POS with PINs, staff roles and branches: everything Restora does.', canonical: '/features' },
  },
  {
    path: '/pricing',
    page: 'pricing_page',
    load: () => import('../pages/pricing_page'),
    meta: { title: 'Pricing: free restaurant software, no card', description: 'Restora is free while we grow: every feature, every branch, every staff member. No card needed.', canonical: '/pricing' },
  },
  {
    path: '/download',
    page: 'download_page',
    load: () => import('../pages/download_page'),
    meta: { title: 'Download Restora Print for Windows, and the apps', description: 'Download Restora Print, the free Windows app that prints kitchen slips and receipts by itself, even offline. Restora runs in any browser; the phone apps are coming.', canonical: '/download' },
  },
  {
    path: '/demo',
    page: 'demo_page',
    load: () => import('../pages/demo_page'),
    meta: { title: 'Book a free demo on WhatsApp', description: 'See Restora with your own menu: a short walkthrough on a WhatsApp call for you and your team.', canonical: '/demo' },
    hydrate: true,
  },
  {
    path: '/contact',
    page: 'contact_page',
    load: () => import('../pages/contact_page'),
    meta: { title: 'Contact us on WhatsApp or email', description: `Talk to Restora on WhatsApp at ${SITE.whatsappDisplay} or email ${SITE.email}.`, canonical: '/contact' },
  },
  {
    path: '/about',
    page: 'about_page',
    load: () => import('../pages/about_page'),
    meta: { title: 'About: restaurant software made in Pakistan', description: 'Restora is made in Pakistan for Pakistani restaurants: simple enough for a waiter, complete enough for an owner with several branches.', canonical: '/about' },
  },
  { path: '/privacy', page: 'privacy_page', load: () => import('../pages/privacy_page'), meta: { title: 'Privacy policy', description: 'What Restora stores, why, who can see it, and how to have it deleted.', canonical: '/privacy' } },
  { path: '/terms', page: 'terms_page', load: () => import('../pages/terms_page'), meta: { title: 'Terms of use', description: 'The terms for using Restora, the restaurant software for orders, tables and khata: your account, your data, and what each side agrees to.', canonical: '/terms' } },
  {
    path: '/refunds',
    page: 'refunds_page',
    load: () => import('../pages/refunds_page'),
    meta: { title: 'Refund policy', description: 'Restora is free, so there is nothing to refund. How refunds will work if paid plans come.', canonical: '/refunds' },
  },
];

export default ROUTES;
