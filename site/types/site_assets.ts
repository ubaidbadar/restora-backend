/** The built files a page links to (site/dist/manifest.json, written by site/build.ts). */
export default interface SiteAssets {
  css: string;
  client: string;
  chunks: string[];
}
