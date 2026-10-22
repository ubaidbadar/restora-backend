import type SiteRoute from '../types/site_route';
import SITE from './site';

/** Every page of the site. The table's menu is not here: it loads its data per request (see site/server.tsx). */
const ROUTES: SiteRoute[] = [
  { path: '/', page: 'home_page', load: () => import('../pages/home_page'), meta: { canonical: '/' } },
  {
    path: '/features',
    page: 'features_page',
    load: () => import('../pages/features_page'),
    meta: { title: 'Features', description: 'Orders, table QR codes, khata, customers and WhatsApp, offline orders, staff roles, branches, menu and payments: everything Restora does for your restaurant.', canonical: '/features' },
  },
  {
    path: '/pricing',
    page: 'pricing_page',
    load: () => import('../pages/pricing_page'),
    meta: { title: 'Pricing', description: 'Restora is free while we grow: every feature, every branch, every staff member. No card needed.', canonical: '/pricing' },
  },
  {
    path: '/download',
    page: 'download_page',
    load: () => import('../pages/download_page'),
    meta: { title: 'Apps', description: 'Use Restora in any browser today. The Android and iPhone apps for staff are on their way to Google Play and the App Store.', canonical: '/download' },
  },
  {
    path: '/demo',
    page: 'demo_page',
    load: () => import('../pages/demo_page'),
    meta: { title: 'Book a demo', description: 'See Restora with your own menu: a short walkthrough on a WhatsApp call for you and your team.', canonical: '/demo' },
    hydrate: true,
  },
  {
    path: '/contact',
    page: 'contact_page',
    load: () => import('../pages/contact_page'),
    meta: { title: 'Contact', description: `Talk to Restora on WhatsApp at ${SITE.whatsappDisplay} or email ${SITE.email}.`, canonical: '/contact' },
  },
  {
    path: '/about',
    page: 'about_page',
    load: () => import('../pages/about_page'),
    meta: { title: 'About', description: 'Restora is made in Pakistan for Pakistani restaurants: simple enough for a waiter, complete enough for an owner with several branches.', canonical: '/about' },
  },
  { path: '/privacy', page: 'privacy_page', load: () => import('../pages/privacy_page'), meta: { title: 'Privacy policy', description: 'What Restora stores, why, who can see it, and how to have it deleted.', canonical: '/privacy' } },
  { path: '/terms', page: 'terms_page', load: () => import('../pages/terms_page'), meta: { title: 'Terms of use', description: 'The terms for using Restora.', canonical: '/terms' } },
  {
    path: '/refunds',
    page: 'refunds_page',
    load: () => import('../pages/refunds_page'),
    meta: { title: 'Refund policy', description: 'Restora is free, so there is nothing to refund. How refunds will work if paid plans come.', canonical: '/refunds' },
  },
];

export default ROUTES;
