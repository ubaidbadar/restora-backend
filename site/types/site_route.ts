import type { ComponentType } from 'react';
import type PageMeta from './page_meta';

/** One page of restora.live: where it is, its module, its <head>, and the data it is rendered with. */
export default interface SiteRoute {
  path: string;
  /** The folder under pages/, which is also how the browser finds the page to hydrate. */
  page: string;
  load: () => Promise<{ default: ComponentType<any> }>;
  meta: PageMeta;
  /** false for pages without the header and footer (a table's menu). */
  layout?: boolean;
  /** Runs in the browser too (forms, the cart). Every other page is plain HTML with no script. */
  hydrate?: boolean;
}
