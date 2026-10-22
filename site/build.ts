/**
 * Builds what the site's pages link to, into site/dist: the browser script (one chunk per hydrated page), the CSS, and
 * manifest.json with their hashed names. Run with `bun run build`; the deploy does it before packaging.
 */
import path from 'path';
import { rm } from 'fs/promises';
import { compile, optimize } from '@tailwindcss/node';
import { Scanner } from '@tailwindcss/oxide';

const ROOT = import.meta.dir;
const OUT = path.join(ROOT, 'dist', 'assets');
await rm(path.join(ROOT, 'dist'), { recursive: true, force: true });

const js = await Bun.build({
  entrypoints: [path.join(ROOT, 'client.tsx')],
  outdir: OUT,
  target: 'browser',
  format: 'esm',
  splitting: true,
  minify: true,
  naming: { entry: '[name]-[hash].[ext]', chunk: 'chunk-[hash].[ext]' },
  define: {
    'process.env.NODE_ENV': '"production"',
    'process.env.APP_URL': JSON.stringify(process.env.APP_URL ?? 'https://app.restora.live'),
  },
});
if (!js.success) {
  console.error(js.logs);
  process.exit(1);
}

// Tailwind's own compiler, as its CLI runs it: the classes used under site/ (index.css says `source(".")`).
const compiler = await compile(await Bun.file(path.join(ROOT, 'index.css')).text(), { base: ROOT, onDependency: () => {} });
const sources = compiler.root && compiler.root !== 'none' ? [{ ...compiler.root, negated: false }] : [];
const candidates = new Scanner({ sources: [...sources, ...compiler.sources] }).scan();
const css = optimize(compiler.build(candidates), { minify: true }).code;
const cssName = `site-${Bun.hash(css).toString(36)}.css`;
await Bun.write(path.join(OUT, cssName), css);

const url = (file: string) => `/assets/${path.basename(file)}`;
const manifest = {
  css: `/assets/${cssName}`,
  client: url(js.outputs.find((output) => output.kind === 'entry-point')!.path),
  chunks: js.outputs.filter((output) => output.kind === 'chunk').map((output) => url(output.path)),
};
await Bun.write(path.join(ROOT, 'dist', 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('site built:', manifest);
