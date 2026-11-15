// Dev-only smoke test: drives the smoke build in Chromium (mobile + desktop) and fails on any runtime error.
// Usage: node scripts/smoke/build.mjs && node scripts/smoke/run.mjs
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(join(process.env.SMOKE_NM || '/opt/npm-tools/node_modules', 'playwright'));
const dist = join(here, process.env.SMOKE_DIST || 'dist'), shots = join(here, process.env.SMOKE_SHOTS || 'shots');
mkdirSync(shots, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const p = join(dist, req.url === '/' ? 'index.html' : req.url.split('?')[0]);
  if (!existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[extname(p)] ?? 'application/octet-stream' }); res.end(readFileSync(p));
}).listen(4173);
const base = 'http://localhost:4173/';
const errors = [];
const aiCalls = [];
const browser = await chromium.launch();

async function session(name, viewport) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: viewport.width < 600 });
  // TEST ONLY: answer the AI endpoints with canned responses so the UI flow can be verified offline.
  // (The real services are tested in a browser with internet access.)
  const aiMock = async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const last = body.messages?.[body.messages.length - 1]?.content ?? '';
    aiCalls.push(last.slice(0, 60));
    const content = /weekly workout plan/.test(last)
      ? JSON.stringify({ name: 'AI Strength Plan', notes: 'Two full-body days with rest in between.', days: [
          { name: 'Day A', exercises: [{ id: 'ex_squat', sets: 3, reps: '8-10', rest: 120 }, { id: 'ex_bench_press', sets: 3, reps: '8-10', rest: 120 }, { id: 'ex_unknown', sets: 3, reps: '10', rest: 60 }] },
          { name: 'Day B', exercises: [{ id: 'ex_deadlift', sets: 3, reps: '5', rest: 150 }, { id: 'ex_lat_pulldown', sets: 3, reps: '10-12', rest: 90 }] }] })
      : '# Keep your rhythm\n- You trained once this week – **nice start**.\n- Your sleep was 8 h.\n→ Plan one more session.';
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ choices: [{ message: { content } }] }) });
  };
  await ctx.route(/oai\.endpoints\.kepler\.ai\.cloud\.ovh\.net|api\.llm7\.io/, aiMock);
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`[${name}] pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${name}] console: ${m.text()}`); });
  const shot = (n) => page.screenshot({ path: join(shots, `${name}-${n}.png`) });
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(350); };
  const overflow = async (where) => { const o = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth); if (o > 1) errors.push(`[${name}] horizontal overflow ${o}px on ${where}`); };
  const click = (text) => page.getByRole('button', { name: text, exact: true }).first().click();

  await page.goto(base);
  await page.getByText('Let’s set up FitFlow').waitFor();
  await shot('00-onboarding');
  await page.getByRole('tab', { name: 'Deutsch' }).click();
  await page.getByText('Richten wir FitFlow ein').waitFor();
  await page.getByRole('tab', { name: 'Hrvatski' }).click();
  await page.getByText('Postavimo FitFlow').waitFor();
  await page.getByRole('tab', { name: 'English' }).click();
  await page.locator('input').first().fill('Lana');
  for (let i = 0; i < 4; i++) { await click('Continue'); await page.waitForTimeout(120); }
  await click('Start using FitFlow');
  await page.getByText('Lana').first().waitFor();
  await shot('01-home');
  await overflow('home');

  // hydration quick add from the dashboard
  await page.getByRole('button', { name: '+250' }).click();
  await page.getByText('250').first().waitFor();

  // recipe builder: pasta + chicken, 2 portions
  await go('/recipes/new');
  await page.getByPlaceholder('e.g. Chicken pasta').fill('Chicken pasta');
  for (const [q, grams] of [['pasta, dry', '200'], ['chicken breast, raw', '300'], ['olive oil', '10']]) {
    await page.getByRole('button', { name: 'Add ingredient' }).first().click();
    await page.getByPlaceholder('Search food or type a barcode').fill(q);
    await page.locator('.sheet .item-main').first().click();
    await page.locator('.sheet input.input').first().fill(grams);
    await page.locator('.sheet-foot .btn.primary').click();
    await page.waitForTimeout(150);
  }
  const kcal = await page.locator('.recipe-kpis.big b').first().innerText();
  // (200*3.71 + 300*1.20 + 10*8.84) / 2 = 595.2
  if (!/595/.test(kcal)) errors.push(`[${name}] recipe per-portion kcal expected 595, got "${kcal}"`);
  await page.getByRole('button', { name: 'Save recipe' }).click();
  await page.waitForTimeout(300);
  await shot('02-recipe');
  await overflow('recipe');
  await page.getByRole('button', { name: 'Add to diary' }).click();
  await page.locator('.sheet-foot .btn.primary').click();
  await go('/nutrition');
  await page.getByText('Chicken pasta').first().waitFor();
  await shot('03-nutrition');
  await overflow('nutrition');

  // plan → gym mode → complete a set → finish
  await go('/gym');
  await page.getByRole('button', { name: 'New plan' }).click();
  await page.getByRole('button', { name: 'Add exercise' }).first().click();
  await page.getByPlaceholder('Search exercises or equipment').fill('chest press');
  await page.locator('.sheet .item-main').first().click();
  await page.keyboard.press('Escape');
  await shot('04-plan');
  await page.getByRole('button', { name: 'Start', exact: true }).first().click();
  await page.getByText('Chest Press Machine').first().waitFor();
  await page.locator('.gm-input').nth(1).fill('40');
  await page.getByRole('button', { name: /Complete set 1/ }).click();
  await page.locator('.timer-clock').waitFor();
  await shot('05-gymmode-timer');
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: /Complete set 2/ }).click();
  await page.getByRole('button', { name: 'Skip' }).click();
  await page.getByRole('button', { name: /Complete set 3/ }).click();
  await page.getByRole('button', { name: 'Finish workout', exact: true }).click();
  await page.waitForTimeout(400);
  if (!(await page.locator('.cal-day.today .dot.gym').count())) errors.push(`[${name}] finished workout not shown in calendar`);
  await shot('06-calendar');
  await overflow('calendar');

  // sleep
  await go('/sleep');
  await page.getByRole('button', { name: 'Record sleep' }).click();
  await page.locator('.sheet-foot .btn.primary').click();
  await page.waitForTimeout(300);
  await shot('07-sleep');
  await overflow('sleep');

  // habits, goals
  await go('/habits');
  await page.getByRole('button', { name: 'New habit' }).click();
  await page.locator('.sheet input').fill('Stretch 5 minutes');
  await page.locator('.sheet-foot .btn.primary').click();
  await page.locator('.ht-cell.today').first().click();
  await shot('08-habits');
  await overflow('habits');
  await go('/goals');
  await page.getByRole('button', { name: 'New goal' }).click();
  await page.locator('.sheet input').first().fill('20 workouts');
  await page.locator('.sheet-foot .btn.primary').click();
  await shot('09-goals');

  for (const r of ['/hydration', '/activity', '/progress', '/ai', '/profile', '/gym/import', '/recipes', '/']) {
    await go(r); await page.waitForTimeout(250); await overflow(r);
    await shot('10' + r.replace(/\//g, '-'));
  }
  // weekly report (rule-based, AI off)
  await go('/ai');
  await page.getByRole('tab', { name: 'Reports' }).click();
  await page.getByRole('button', { name: 'This week so far' }).click();
  await page.locator('.report-text .ai-head').first().waitFor();
  await shot('11-report');

  // language + theme switch, then persistence after reload
  await go('/profile');
  await page.getByRole('tab', { name: 'Deutsch' }).click();
  await page.getByText('Persönliche Angaben').waitFor();
  await page.getByRole('tab', { name: 'Hell' }).click();
  await shot('12-profile-de-light');
  await page.reload();
  await page.getByText('Persönliche Angaben').waitFor();
  await go('/');
  await page.getByText('Lana').first().waitFor();
  await shot('13-home-de-light');
  // back to English + dark for the AI checks
  await go('/profile');
  await page.getByRole('tab', { name: 'English' }).click();
  await page.getByRole('tab', { name: 'Dark' }).click();
  // AI focus card on Home is generated automatically once per day
  await go('/');
  await page.getByText('Keep your rhythm').first().waitFor();
  // AI coach chat
  await go('/ai');
  await page.getByPlaceholder('Ask about your training, meals or sleep…').fill('How was my week?');
  await page.getByRole('button', { name: 'Send' }).click();
  await page.locator('.bubble.assistant .ai-head').first().waitFor();
  await shot('14-ai-chat');
  // AI workout plan
  await go('/gym');
  await page.getByRole('button', { name: 'AI plan' }).click();
  await page.getByRole('button', { name: 'Create suggestion' }).click();
  await page.getByText('AI Strength Plan').waitFor();
  if (await page.getByText('ex_unknown').count()) errors.push(`[${name}] AI plan kept an exercise id that is not in the library`);
  await shot('15-ai-plan');
  await page.getByRole('button', { name: 'Save plan' }).click();
  await page.getByText('Barbell Back Squat').first().waitFor();
  // AI analysis cards
  await go('/sleep');
  await page.getByRole('button', { name: 'Analyse with AI' }).click();
  await page.locator('.ai-card .ai-head').first().waitFor();
  await go('/nutrition');
  await page.getByRole('button', { name: 'Suggest a meal' }).click();
  await page.locator('.ai-card .ai-head').first().waitFor();
  await go('/progress');
  await page.getByRole('button', { name: 'Analyse with AI' }).click();
  await page.locator('.ai-card .ai-head').first().waitFor();
  await shot('16-progress-ai');

  const sizes = name === 'desktop' ? [[1280, 800], [1024, 768]] : [[360, 740]];
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h });
    for (const r of ['/', '/nutrition', '/recipes', '/gym', '/calendar', '/sleep', '/hydration', '/habits', '/goals', '/progress', '/ai', '/profile']) {
      await go(r); await page.waitForTimeout(250); await overflow(`${r} @${w}`);
      await page.screenshot({ path: join(shots, `${w}${r.replace(/\//g, '-')}.png`), fullPage: r === '/' });
    }
  }
  await ctx.close();
}

try {
  await session('mobile', { width: 390, height: 844 });
  await session('desktop', { width: 1440, height: 900 });
} catch (e) { errors.push('TEST ABORTED: ' + e.message.split('\n').slice(0, 6).join(' | ')); }
await browser.close(); server.close();
console.log('AI requests made:', aiCalls.length);
console.log(errors.length ? 'SMOKE FAILED\n' + errors.join('\n') : 'SMOKE OK (mobile + desktop)');
process.exit(errors.length ? 1 : 0);
