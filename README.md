# FitFlow

A mobile-first, local-first fitness and wellness app: workouts with a dedicated gym mode, nutrition diary with a recipe builder, sleep & recovery, hydration, activity, habits, goals, analytics and an optional AI coach. Available in **English, German and Croatian**.

Built with React 19, TypeScript, Vite, SCSS, Supabase (auth + Postgres), IndexedDB (offline), Recharts, PDF.js and Tesseract.js. AI via free keyless services (OVHcloud AI Endpoints, LLM7.io). Installable as a PWA.

> For developers continuing the work: read **PROJECT_STATUS.md** first.

---

## 1. Quick start

Requirements: Node.js 20+ and npm.

```bash
npm install
npm run dev          # http://localhost:5173
```

Without a `.env` file FitFlow runs in **local-only mode**: no account, everything is stored in the browser (IndexedDB) on this device. All tracking features work this way.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Production build into `dist/` (incl. service worker) |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | TypeScript check (`tsc --noEmit`) |
| `npm run check:i18n` | Verifies that every used text key exists in EN, DE and HR |
| `npm run seed` | Regenerates `supabase/seed.sql` from `src/data/*.json` |

---

## 2. Accounts and cloud sync (Supabase, free tier)

1. Create a project at [supabase.com](https://supabase.com).
2. **SQL editor** → run `supabase/schema.sql`, then `supabase/seed.sql`.
3. Copy `.env.example` to `.env` and fill in *Project URL* and *anon public key* (Settings → API). The anon key is meant to be public; security comes from Row Level Security.
4. **Authentication → URL configuration**: set *Site URL* to your app URL and add it (plus `http://localhost:5173`) to *Redirect URLs*. This is required for e-mail confirmation, magic links, password reset and OAuth.
5. Restart `npm run dev`.

### How data is stored
- Every record is written to IndexedDB first, so the app works fully offline (also in the gym without signal).
- `src/lib/sync.ts` pushes changed rows to Supabase and pulls changes from other devices when online, on app focus and every 2 minutes.
- Record ids are created on the device, so retries never create duplicates. Deletions are synchronised as tombstones.
- Conflicts: the newer edit wins. A database trigger refuses to overwrite a row with an older version, so an old offline edit cannot destroy newer data.
- Row Level Security: every user can read and write only their own rows. Built-in foods/exercises (`user_id = null`) are readable by everyone and writable by nobody.

### Sign-in methods
| Method | Setup |
|---|---|
| E-mail + password, e-mail verification, password reset | Works out of the box (Authentication → Providers → Email). |
| "Continue with e-mail" (magic link) | Same provider, no extra setup. |
| Google | Create an OAuth client in Google Cloud Console (type *Web application*), add `https://<project>.supabase.co/auth/v1/callback` as redirect URI, then paste client ID/secret in Supabase → Providers → Google. |
| Apple | Requires a paid Apple Developer account: create a Services ID with *Sign in with Apple*, a key (.p8), and enter Services ID, Team ID, Key ID and key in Supabase → Providers → Apple. Return URL: `https://<project>.supabase.co/auth/v1/callback`. |

The Google and Apple buttons are real integrations, but they only work after the provider is configured. Until then Supabase returns an error that is shown to the user. No credentials are included in this project.

### Account deletion
Deploy the edge function (needs the [Supabase CLI](https://supabase.com/docs/guides/cli)):

```bash
supabase login
supabase link --project-ref <project-ref>
supabase functions deploy delete-account
```

It deletes the auth user; all their rows are removed by `on delete cascade`. "Delete all my data" (without deleting the account) works without the function.

---

## 3. FitFlow AI – works automatically, no setup

FitFlow uses the same AI approach as the LinguaAI project: free AI services **without sign-up and without API key**, called directly from the browser (OpenAI-compatible, CORS enabled):

- [OVHcloud AI Endpoints](https://endpoints.ai.cloud.ovh.net) – Mistral Small 3.2, Qwen 3.5, gpt-oss-120b (anonymous: 2 requests per minute **per model**)
- [LLM7.io](https://llm7.io) – DeepSeek V4 Flash, gpt-oss-20b, Mistral Nemo (anonymous, daily limit per IP) as reserve

`src/lib/aiProviders.ts` rotates between the models, remembers which one worked last, waits briefly when the per-minute limit is reached and skips a busy model for a while. Meta Llama models are deliberately not used.

What this means:
- **Users never enter a key or configure anything**, and there is nothing to configure when deploying – there is no secret at all, so nothing can leak into the frontend or GitHub.
- If every service is busy or offline, FitFlow says so honestly ("try again in a minute"). There are **no scripted fallback answers**. All tracking, statistics, rule-based insights and rule-based weekly reports keep working.
- Data is sent only when the user asks the coach, opens an AI analysis, creates an AI plan, or once per day for the "Your focus today" card / a weekly report – never continuously. Users can switch AI off and choose which data categories may be used (Profile → AI and data sharing). Only a summary of the last 14 days is sent.

Where the AI is used (`src/lib/ai.ts`):

| Feature | Where |
|---|---|
| Daily personal focus (goals + last 14 days), generated once per day | Home, AI Coach → Insights |
| AI Coach chat with the user's data; can prefill a recipe for the Recipe Builder | AI Coach |
| Sleep & recovery analysis | Sleep & Recovery, AI Coach → Insights |
| Progress analysis for the selected period (figures computed by the app) | Analytics |
| Balanced meal idea respecting dietary preferences and allergies | Nutrition |
| Weekly workout plan built only from the exercise library, reviewed before saving | Gym → AI plan |
| Weekly report narrative (figures computed by the app) | AI Coach → Reports |
| Structuring text of an imported plan | Gym → Import plan |

All numbers are calculated by the app (`src/lib/stats.ts`, `src/lib/nutrition.ts`); the AI only explains, summarises and suggests, and never changes records without the user confirming.

Credits: AI provided free of charge by OVHcloud AI Endpoints and LLM7.io (shown in the app).

## 4. Deployment

The build output is a static site (`dist/`). FitFlow uses hash-based routing, so no server rewrite rules are needed.

- **Vercel / Netlify / Cloudflare Pages**: build command `npm run build`, output directory `dist`, add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables.
- Use HTTPS (required for the service worker, notifications and installation).
- Add the deployed URL to Supabase *Redirect URLs* (see 2.4).

### Install on a phone (PWA)
- iPhone (Safari): Share → *Add to Home Screen*.
- Android (Chrome): menu → *Install app*.

The service worker precaches the app, so it opens and works without a connection.

---

## 5. Features and honest limitations

| Area | Notes |
|---|---|
| Nutrition | Built-in list of 108 common ingredients (raw and cooked kept separate), Open Food Facts search incl. barcodes (online), own foods, favourites, recent foods, copy meals. Missing values are shown as missing (`–`, totals as `≥`), never as 0. No calorie targets. |
| Recipe Builder | Grams, ml, tsp, tbsp, cup, pieces. Only grams are exact; other units are flagged as approximate. Per-portion and total values, ingredient breakdown, duplicate, favourite, add to diary with portions eaten. The AI can prefill a draft from a description; the user reviews before saving. |
| Gym | 62 exercises in 8 categories with schematic muscle illustrations (drawn in code, always matching the exercise), instructions and safety tips in 3 languages, alternatives, custom exercises. Plans with training days, weekdays, sets/reps/rest/notes, reorder, duplicate. |
| Gym mode | Full screen, large controls, rest timer (start/pause/resume/skip/restart/±15 s, sound, vibration), last-time reference, personal-best notice, keeps the screen on where supported. Vibration is not available on iPhone (sound is used). |
| Plan import | PDF text via PDF.js; photos via Tesseract OCR in the browser (downloads language data on first use). Every row is reviewed before a plan is created. Scanned PDFs without text layer: use a photo/screenshot. |
| Calendar | Colored dots per recorded activity type; a dot means *recorded*, not *goal reached*. Day details, notes, week overview, monthly history. |
| Sleep & recovery | Manually entered times, own ratings for quality and morning energy, rest days, soreness, stress. No sleep stages or measured quality. |
| Activity | Manual entries; steps only if the user enters them. Nothing is estimated. |
| Habits, goals, achievements | No streaks that can break; achievements are based on totals. Goals with optional number target and milestones. |
| Analytics | Week, month, custom range with comparison to the previous period; all charts from stored data only. |
| Notifications | Workout, habit, bedtime, hydration, weekly report and milestone reminders while the app is open or installed and running in the background. A web app cannot notify when fully closed (that needs a push server). |
| Apple Health / Health Connect | Native-only APIs. The integration interface is prepared in `src/lib/health.ts`; in the web app both are shown as *not connected*. Nothing is simulated. To enable: wrap the app with Capacitor and register a HealthKit / Health Connect adapter; request only steps, distance, workouts and sleep. |
| Subscriptions | Not active; all features are free. `src/lib/entitlements.ts` and the `subscriptions` table prepare Free / Premium / AI Premium. When introduced: RevenueCat (mobile) or Stripe (web) webhook → edge function writes `subscriptions` with the service role → enforce premium checks server-side. Privacy, export and account deletion must never be gated. |
| Under 18 | No weight-loss advice or calorie targets; the AI gets explicit age-appropriate instructions. |

---

## 6. Project structure

```
src/
  lib/          data store (IndexedDB), sync, auth, nutrition maths, stats, insights,
                weekly report, AI (ai.ts, aiProviders.ts), plan parser, notifications, entitlements, health
  components/   UI kit, layout/navigation, food & exercise components, rest timer, charts
  pages/        one file per screen
  i18n/         en.ts (source), de.ts, hr.ts
  data/         built-in foods and exercises (EN/DE/HR), daily messages
  styles/       design tokens, base, components, layout, pages (SCSS)
supabase/       schema.sql, seed.sql, edge function delete-account
pwa/            service worker template (filled in by vite.config.ts at build time)
public/         manifest, icons
scripts/        i18n check, seed generator, sandbox smoke test
```

### Adding a language
Copy `src/i18n/en.ts`, translate the values, register it in `src/i18n/index.ts` (`LANGS`, `DICTS`, `LOCALES`) and run `npm run check:i18n`.

### Smoke test (optional)
`scripts/smoke` drives the app with Playwright on 360/390 px and 1024/1280/1440 px (onboarding, recipe maths, diary, gym mode, calendar, sleep, habits, goals, AI coach, AI plan, AI analyses with mocked AI responses, language/theme persistence, no horizontal overflow). `build-real.mjs` bundles with the real libraries from `node_modules`, `build.mjs` with stubs. It was made for an environment without npm access: `SMOKE_NM=<path to node_modules with esbuild, react, react-dom, playwright> node scripts/smoke/build.mjs && node scripts/smoke/run.mjs`. It is not a replacement for `npm run build`.
