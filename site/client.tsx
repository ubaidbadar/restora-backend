import type { ComponentType } from 'react';
import { hydrateRoot } from 'react-dom/client';
import SiteLayout from './hoc/site_layout';
import type PageData from './types/page_data';

/** The pages that run in the browser. Each is its own chunk, so a page loads only its own code. */
const PAGES: Record<string, () => Promise<{ default: ComponentType<any> }>> = {
  demo_page: () => import('./pages/demo_page'),
  table_page: () => import('./pages/table_page'),
};

// The server rendered this page and left what it rendered it with: the browser takes the same HTML over.
const data: PageData = JSON.parse(document.getElementById('page-data')!.textContent!);
const { default: Page } = await PAGES[data.page]!();
const page = <Page {...data.props} />;

hydrateRoot(document.getElementById('root')!, data.layout ? <SiteLayout path={data.path}>{page}</SiteLayout> : page);
