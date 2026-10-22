/** What a page puts in its <head>: its title (the home page has none of its own), what it is about, and its address. */
export default interface PageMeta {
  title?: string;
  description?: string;
  canonical?: string;
  /** A table's menu: nothing to index, nothing to share. */
  noindex?: boolean;
}
