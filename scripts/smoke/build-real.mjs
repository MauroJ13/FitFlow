// Dev-only: bundles the app with the REAL libraries from ./node_modules and the real Sass compiler.
// Only difference to `vite build`: esbuild instead of Rollup (used where Vite's native binaries can't run).
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const require = createRequire(join(root, 'package.json'));
const esbuild = require(join(process.env.SMOKE_NM || '/opt/npm-tools/node_modules', 'esbuild'));
const sass = require('sass');
const out = join(here, 'dist-real');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const plugin = {
  name: 'real',
  setup(b) {
    b.onResolve({ filter: /^lucide-react$/ }, () => ({ path: require.resolve('lucide-react/dist/cjs/lucide-react.js') }));
    b.onResolve({ filter: /\?url$/ }, (a) => ({ path: a.path, namespace: 'url' }));
    b.onLoad({ filter: /.*/, namespace: 'url' }, () => ({ contents: 'export default "pdf.worker.min.mjs"', loader: 'js' }));
    b.onLoad({ filter: /\.scss$/ }, (a) => {
      const r = sass.compile(a.path, { loadPaths: [dirname(a.path)], style: 'expanded' });
      return { contents: r.css, loader: 'css' };
    });
  },
};
const res = await esbuild.build({
  entryPoints: [join(root, 'src/main.tsx')], bundle: true, outdir: out, format: 'esm', splitting: true, jsx: 'automatic',
  define: { 'import.meta.env.VITE_SUPABASE_URL': 'undefined', 'import.meta.env.VITE_SUPABASE_ANON_KEY': 'undefined', 'import.meta.env.PROD': 'false', 'process.env.NODE_ENV': '"development"' },
  plugins: [plugin], logLevel: 'warning', target: 'es2022', nodePaths: [join(root, 'node_modules')], metafile: true,
});
cpSync(join(root, 'public'), out, { recursive: true });
writeFileSync(join(out, 'index.html'), '<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="main.css"></head><body><div id="root"></div><script type="module" src="main.js"></script></body></html>');
console.log('real build ok', res.errors.length, 'errors');
