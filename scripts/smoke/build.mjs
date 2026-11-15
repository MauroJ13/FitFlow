// Dev-only smoke build for sandboxes without npm access: bundles the app with esbuild and
// replaces libraries that are not installed by small stubs. NOT the production build (that is `vite build`).
// Usage: SMOKE_NM=<global node_modules> node scripts/smoke/build.mjs
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const require = createRequire(import.meta.url);
const NM = process.env.SMOKE_NM || '/opt/npm-tools/node_modules';
const esbuild = require(join(NM, 'esbuild'));
const out = join(here, 'dist');
mkdirSync(out, { recursive: true });

const stubs = {
  name: 'stubs',
  setup(b) {
    const proxy = (body) => ({ contents: body, loader: 'js', resolveDir: NM });
    b.onResolve({ filter: /^(lucide-react|recharts|@supabase\/supabase-js|tesseract\.js|pdfjs-dist.*)$/ }, (a) => ({ path: a.path, namespace: 'stub' }));
    b.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: join(here, 'router-stub.jsx') }));
    b.onResolve({ filter: /^react(-dom)?(\/.*)?$/ }, (a) => ({ path: require.resolve(join(NM, a.path)) }));
    // explicit named exports: collect every name the app imports from the stubbed library
    const names = (lib) => { const set = new Set(); const walk = (d) => readdirSync(d, { withFileTypes: true }).forEach((e) => { const p = join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.tsx?$/.test(p)) for (const m of readFileSync(p, 'utf8').matchAll(new RegExp(`import \\{([^}]+)\\} from '${lib}'`, 'g'))) m[1].split(',').forEach((n) => n.trim() && set.add(n.trim())); }); walk(join(root, 'src')); return [...set]; };
    b.onLoad({ filter: /lucide-react/, namespace: 'stub' }, () => proxy(`import React from 'react';const I=(n)=>(p)=>React.createElement('svg',{width:p.size||24,height:p.size||24,className:p.className,'data-icon':n,viewBox:'0 0 24 24'},React.createElement('circle',{cx:12,cy:12,r:8,fill:'none',stroke:'currentColor',strokeWidth:2}));` + names('lucide-react').map((n) => `export const ${n}=I('${n}');`).join('')));
    b.onLoad({ filter: /recharts/, namespace: 'stub' }, () => proxy(`import React from 'react';const C=(n)=>(p)=>React.createElement('div',{'data-chart':n,style:n==='ResponsiveContainer'?{height:p.height,background:'var(--bg-2)',borderRadius:12}:undefined},n==='ResponsiveContainer'?p.children:null);` + names('recharts').map((n) => `export const ${n}=C('${n}');`).join('')));
    b.onLoad({ filter: /.*/, namespace: 'stub' }, () => proxy(`module.exports={createClient(){throw new Error('stub')},createWorker(){throw new Error('stub')},default:''};`));
    // SCSS → CSS without sass: the styles only use plain nesting plus the "desktop" mixin (see PROJECT_STATUS.md)
    b.onLoad({ filter: /global\.scss$/ }, (a) => {
      const dir = dirname(a.path);
      const css = readdirSync(dir).filter((f) => f.startsWith('_') && f !== '_mixins.scss').sort((x, y) => order(x) - order(y))
        .map((f) => readFileSync(join(dir, f), 'utf8')).join('\n')
        .replace(/@use [^;]+;/g, '').replace(/@include desktop\s*\{/g, '@media (min-width: 960px) {').replace(/^\s*\/\/.*$/gm, '');
      return { contents: css, loader: 'css' };
    });
  },
};
const order = (f) => ['_tokens.scss', '_base.scss', '_components.scss', '_layout.scss', '_pages.scss'].indexOf(f);

const res = await esbuild.build({
  entryPoints: [join(root, 'src/main.tsx')], bundle: true, outdir: out, format: 'esm', splitting: true, jsx: 'automatic',
  define: { 'import.meta.env.VITE_SUPABASE_URL': 'undefined', 'import.meta.env.VITE_SUPABASE_ANON_KEY': 'undefined', 'import.meta.env.PROD': 'false' },
  plugins: [stubs], logLevel: 'warning', target: 'es2022', sourcemap: 'inline',
});
writeFileSync(join(out, 'index.html'), '<!doctype html><html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="main.css"></head><body><div id="root"></div><script type="module" src="main.js"></script></body></html>');
console.log('smoke build ok', res.errors.length, 'errors');
