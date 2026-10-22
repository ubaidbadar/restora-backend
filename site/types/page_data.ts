/** What the server hands a hydrated page in the HTML: which page, where, and the props it rendered with. */
export default interface PageData {
  page: string;
  path: string;
  layout: boolean;
  props: Record<string, unknown>;
}
