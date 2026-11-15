// Verifies that every translation key used in the code exists in en.ts and that de.ts / hr.ts have exactly the same keys.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const keysOf = (file) => new Set([...readFileSync(file, 'utf8').matchAll(/^\s*'([a-zA-Z0-9_.]+)':|,\s'([a-zA-Z0-9_.]+)':/gm)].map((m) => m[1] ?? m[2]));
const walk = (dir) => readdirSync(dir).flatMap((f) => { const p = join(dir, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : []; });

const en = keysOf('src/i18n/en.ts');
let failed = false;
const used = new Set();
for (const file of walk('src').filter((f) => !f.includes('i18n'))) {
  const src = readFileSync(file, 'utf8');
  for (const m of src.matchAll(/(?:\bt|translate)\(\s*'([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  for (const m of src.matchAll(/'((?:ins|ai\.s|nav|home|food|auth)\.[a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
}
const missing = [...used].filter((k) => !en.has(k)).sort();
if (missing.length) { failed = true; console.log('Used in code but missing in en.ts:\n  ' + missing.join('\n  ')); }
for (const lang of ['de', 'hr']) {
  const file = `src/i18n/${lang}.ts`;
  if (!existsSync(file)) { failed = true; console.log(`${file} does not exist`); continue; }
  const keys = keysOf(file);
  const lack = [...en].filter((k) => !keys.has(k));
  const extra = [...keys].filter((k) => !en.has(k));
  if (lack.length) { failed = true; console.log(`${lang}: missing ${lack.length}:\n  ` + lack.join('\n  ')); }
  if (extra.length) { failed = true; console.log(`${lang}: unknown keys:\n  ` + extra.join('\n  ')); }
}
console.log(failed ? 'i18n check FAILED' : `i18n check OK (${en.size} keys, 3 languages)`);
process.exit(failed ? 1 : 0);
