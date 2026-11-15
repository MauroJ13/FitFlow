/**
 * FitFlow AI – real AI responses from free, keyless services (same approach as LinguaAI, see ./aiProviders.ts).
 * Nobody configures anything: no API key for users, no secret in the build, nothing to set up when deploying.
 * AI is used for explanations, summaries, recommendations and plans only.
 * All numbers come from lib/stats.ts and lib/nutrition.ts; the AI never changes records by itself.
 */
import type { Lang, Prefs, Profile } from '../types';
import { addDays, fmtDuration, rangeDays, today } from './date';
import { getData, periodStats } from './stats';
import { getExerciseMap, exName, isMinor } from './hooks';
import { getTable } from './db';
import { translate } from '../i18n';
import { AiError, freeChat, parseJson, type ChatMsg } from './aiProviders';

export type { ChatMsg } from './aiProviders';
export { PROVIDER_CREDIT } from './aiProviders';
const LANG_NAME: Record<Lang, string> = { en: 'English', de: 'German', hr: 'Croatian' };

/** AI features are on unless the user switched them off (privacy choice). */
export const aiEnabled = (prefs: Prefs) => prefs.ai.enabled !== false;

export async function aiChat(messages: ChatMsg[], opts: { json?: boolean; temperature?: number; signal?: AbortSignal } = {}): Promise<{ content: string; model: string }> {
  const r = await freeChat(messages, opts);
  return { content: r.text, model: `${r.provider} · ${r.model}` };
}

/** JSON answer; free models occasionally return broken JSON → ask once more. */
export async function aiJson<T>(messages: ChatMsg[], opts: { temperature?: number; signal?: AbortSignal } = {}): Promise<{ data: T; model: string }> {
  for (let attempt = 0; ; attempt++) {
    const r = await aiChat(messages, { ...opts, json: true });
    try { return { data: parseJson<T>(r.content), model: r.model }; } catch (e) { if (attempt >= 1) throw e; }
  }
}

/** Translation key for a user-facing error message. */
export function aiErrorKey(e: unknown): string {
  if (e instanceof AiError) {
    if (e.kind === 'rate') return 'ai.err_rate';
    if (e.kind === 'network') return navigator.onLine ? 'ai.err_network' : 'ai.err_offline';
    if (e.kind === 'aborted') return 'ai.err_aborted';
  }
  return 'ai.err_other';
}

export function systemPrompt(lang: Lang, profile: Profile | undefined): string {
  const rules = [
    `You are FitFlow AI, a supportive wellness assistant inside the FitFlow fitness app. Reply in ${LANG_NAME[lang]} (the app language) – but if the user writes their message in another language, reply in the user's language. Be concise, warm and practical.`,
    'Formatting: short paragraphs, "- " bullet points and **bold** only. No tables, no headings in chat answers unless asked.',
    'Use only the recorded data provided below. Never invent measurements, steps, calories burned, sleep stages or sleep quality. If something was not recorded, say so plainly.',
    'You cannot change any records. The app does all calculations; do not present your own nutrition numbers as exact.',
    'When the user describes a homemade meal, ask for missing quantities in grams instead of guessing. Once all quantities are known, append exactly one block like this so the app can open the Recipe Builder for the user to review:',
    '```fitflow-recipe\n{"name":"Chicken pasta","portions":2,"ingredients":[{"name":"pasta, dry","grams":200},{"name":"chicken breast, raw","grams":300}]}\n```',
    'Use simple generic English ingredient names in that block and say whether an ingredient is raw, dry or cooked.',
    'Never prescribe calorie deficits, restrictive diets, weight-loss targets or appearance-based scores. Do not diagnose; for pain, injury or health concerns suggest seeing a qualified professional.',
    'Encourage recovery and sustainable habits. Never encourage excessive training. Describe patterns without judging missed days.',
  ];
  if (isMinor(profile)) {
    rules.push('The user is under 18. Prioritise balanced nutrition, enough sleep, healthy development, good technique and moderate loads. No weight-loss advice and no calorie targets.');
  }
  return rules.join('\n');
}

/** Compact summary of the last 14 days, limited to the categories the user agreed to share. */
export function buildContext(prefs: Prefs, profile: Profile | undefined, lang: Lang): string {
  const share = prefs.ai.share;
  const data = getData();
  const end = today();
  const days = rangeDays(addDays(end, -13), end).map(data.day);
  const out: string[] = [`Today: ${end}. Data below covers the last 14 days. Categories not listed were not shared or not recorded.`];

  if (share.profile && profile) {
    const p: string[] = [];
    if (profile.age != null) p.push(`age ${profile.age}`);
    if (profile.gender) p.push(`gender ${profile.gender}`);
    if (profile.experience) p.push(`training experience ${profile.experience}`);
    if (profile.goals.length) p.push(`goals: ${profile.goals.map((g) => translate(`goal.${g}`, undefined, 'en')).join(', ')}`);
    if (profile.equipment.length) p.push(`equipment: ${profile.equipment.join(', ')}`);
    if (profile.exercise_prefs) p.push(`exercise preferences: ${profile.exercise_prefs}`);
    if (profile.dietary_prefs) p.push(`dietary preferences: ${profile.dietary_prefs}`);
    if (profile.allergies) p.push(`food allergies: ${profile.allergies}`);
    if (profile.sleep_bedtime && profile.sleep_waketime) p.push(`usual sleep schedule ${profile.sleep_bedtime}–${profile.sleep_waketime}`);
    if (profile.interests) p.push(`interests: ${profile.interests}`);
    if (p.length) out.push(`PROFILE: ${p.join('; ')}`);
  }
  if (share.workouts) {
    const exMap = getExerciseMap();
    const lines = days.filter((d) => d.has.gym).map((d) => {
      const best = new Map<string, string>();
      for (const s of d.sets) {
        const ex = exMap.get(s.exercise_id);
        const name = ex ? exName(ex, 'en') : s.exercise_name;
        best.set(name, `${best.get(name) ? best.get(name) + ', ' : ''}${s.reps}${s.weight ? `x${s.weight}kg` : ''}`);
      }
      return `${d.date}: ${d.sessions.map((s) => s.name).join(' + ')} – ${[...best].map(([n, v]) => `${n} [${v}]`).join('; ') || 'no sets recorded'}`;
    });
    out.push(`WORKOUTS (${lines.length} days):\n${lines.join('\n') || 'none recorded'}`);
  }
  if (share.nutrition) {
    const lines = days.filter((d) => d.has.nutrition).map((d) => {
      const n = d.nutrition;
      return `${d.date}: ${Math.round(n.kcal)} kcal, P ${Math.round(n.protein)} g, C ${Math.round(n.carbs)} g, F ${Math.round(n.fat)} g, fibre ${Math.round(n.fiber)} g${n.missing.length ? ' (some values missing → minimum)' : ''}; items: ${d.entries.map((e) => e.label).join(', ')}`;
    });
    out.push(`NUTRITION LOGGED (${lines.length} days, values are what was logged, not targets):\n${lines.join('\n') || 'none recorded'}`);
  }
  if (share.sleep) {
    const lines = days.filter((d) => d.sleep || d.recovery).map((d) => {
      const sl = d.sleep, r = d.recovery;
      const parts: string[] = [];
      if (sl) parts.push(`bed ${sl.bedtime}, up ${sl.wake_time}, ${fmtDuration(sl.duration_min)}${sl.quality ? `, own sleep rating ${sl.quality}/5` : ''}${sl.energy ? `, morning energy ${sl.energy}/5` : ''}${sl.notes ? `, note: ${sl.notes}` : ''}`);
      if (r) parts.push(`${r.rest_day ? 'rest day' : ''}${r.soreness ? ` soreness ${r.soreness}/5` : ''}${r.stress ? ` stress ${r.stress}/5` : ''}`.trim());
      return `${d.date}: ${parts.filter(Boolean).join('; ')}`;
    });
    out.push(`SLEEP & RECOVERY (self-reported, no device data):\n${lines.join('\n') || 'none recorded'}`);
  }
  if (share.hydration) {
    const lines = days.filter((d) => d.has.water).map((d) => `${d.date}: ${d.waterMl} ml`);
    out.push(`HYDRATION:\n${lines.join('\n') || 'none recorded'}`);
  }
  if (share.activity) {
    const lines = days.flatMap((d) => d.activities.map((a) => `${d.date}: ${a.type} ${a.duration_min} min${a.distance_km ? `, ${a.distance_km} km` : ''}${a.steps ? `, ${a.steps} steps (entered by user)` : ''}`));
    out.push(`ACTIVITY:\n${lines.join('\n') || 'none recorded'}`);
  }
  const goals = getTable('goals').filter((g) => g.status === 'active');
  if (share.profile && goals.length) {
    out.push(`PERSONAL GOALS:\n${goals.map((g) => `${g.title}${g.target ? ` (${g.current}/${g.target} ${g.unit})` : ''}${g.due ? `, due ${g.due}` : ''}`).join('\n')}`);
  }
  if (share.habits && data.habits.length) {
    const lines = data.habits.map((h) => `${h.name}: ${days.filter((d) => d.habitLogs.some((l) => l.habit_id === h.id)).length}/14 days`);
    out.push(`HABITS:\n${lines.join('\n')}`);
  }
  void lang;
  return out.join('\n\n');
}

export interface RecipeDraftAction { name: string; portions: number; ingredients: { name: string; grams: number }[] }
/** Extract an optional recipe proposal from an AI answer. Nothing is saved without the user's review. */
export function parseRecipeAction(text: string): { clean: string; action: RecipeDraftAction | null } {
  const m = text.match(/```fitflow-recipe\s*([\s\S]*?)```/);
  if (!m) return { clean: text, action: null };
  const clean = text.replace(m[0], '').trim();
  try {
    const j = JSON.parse(m[1]);
    const ingredients = Array.isArray(j.ingredients)
      ? j.ingredients.filter((i: { name?: unknown; grams?: unknown }) => typeof i?.name === 'string' && Number(i?.grams) > 0).map((i: { name: string; grams: number }) => ({ name: i.name, grams: Number(i.grams) }))
      : [];
    if (!ingredients.length) return { clean, action: null };
    return { clean, action: { name: String(j.name ?? ''), portions: Number(j.portions) > 0 ? Number(j.portions) : 1, ingredients } };
  } catch {
    return { clean, action: null };
  }
}

/* ------------------------------------------------------------------ */
/* Task prompts: each one is a single request, triggered by the user   */
/* or once per day – personal data is never sent continuously.         */
/* ------------------------------------------------------------------ */

export type AiTask = 'focus' | 'sleep' | 'progress' | 'meal';

function taskInstruction(task: AiTask, lang: Lang, extra: Record<string, string>): string {
  const L = LANG_NAME[lang];
  switch (task) {
    case 'focus':
      return `Based on my goals and the recorded data, give me my personal focus for today in ${L}. Format: one short headline line starting with "# ", then 2–3 bullet points ("- ") with concrete, realistic actions for today (training or rest, nutrition, sleep/recovery). Mention which data you based it on. If almost nothing is recorded, say so and suggest what to record. Max 90 words.`;
    case 'sleep':
      return `Analyse my sleep and recovery in ${L}: duration, regularity of bedtime, my own sleep and energy ratings, rest days and how training days relate to them. Format: "# " headline, then 3–4 bullet points with observations (with the numbers you see) and 1–2 bullet points starting with "→ " with gentle suggestions. Do not claim to know sleep stages or measured sleep quality. Max 140 words.`;
    case 'progress':
      return `Analyse my progress for the period ${extra.from} to ${extra.to} in ${L} using these figures computed by the app (null = not recorded): ${extra.stats}. Compare with the previous period: ${extra.prev}. Format: "# " headline, 3–4 bullet points with observations, 1–2 bullet points starting with "→ " for next steps that fit my goals. Use only these figures and the data below; do not invent numbers. Max 150 words.`;
    case 'meal':
      return `Suggest one balanced meal idea in ${L} for my next meal (${extra.meal}), considering my dietary preferences, allergies and what I already logged today. Format: "# " dish name, one sentence why it fits, then bullet points with ingredients and rough gram amounts for one portion, then 2–3 short preparation steps. Never mention calorie targets or deficits. Max 140 words.`;
  }
}

export async function runAiTask(task: AiTask, prefs: Prefs, profile: Profile | undefined, lang: Lang, extra: Record<string, string> = {}, signal?: AbortSignal) {
  return aiChat([
    { role: 'system', content: `${systemPrompt(lang, profile)}\n\n--- USER DATA (shared with permission) ---\n${buildContext(prefs, profile, lang)}` },
    { role: 'user', content: taskInstruction(task, lang, extra) },
  ], { temperature: 0.5, signal });
}

/** Figures for the progress analysis, computed by the app. */
export function progressFigures(from: string, to: string, prevFrom: string, prevTo: string) {
  const d = getData();
  const pick = (s: ReturnType<typeof periodStats>) => JSON.stringify({
    workouts: s.workouts, sets: s.sets, volumeKg: Math.round(s.volume), daysWithMeals: s.nutritionDays, days: s.days,
    avgSleepMin: s.avgSleepMin == null ? null : Math.round(s.avgSleepMin), bedtimeVariationMin: s.bedtimeSd == null ? null : Math.round(s.bedtimeSd),
    avgEnergy: s.avgEnergy, restDays: s.restDays, activityMin: s.activityMin, habitTicks: s.habitChecks, activeDays: s.activeDays,
  });
  return { stats: pick(periodStats(d, from, to)), prev: pick(periodStats(d, prevFrom, prevTo)) };
}

/* ---------- AI workout plan (reviewed by the user before it is saved) ---------- */
export interface PlanSuggestion { name: string; notes: string; days: { name: string; exercises: { id: string; sets: number; reps: string; rest: number }[] }[] }

export async function suggestPlan(prefs: Prefs, profile: Profile | undefined, lang: Lang, wish: string, signal?: AbortSignal): Promise<{ plan: PlanSuggestion; model: string }> {
  const library = [...getExerciseMap().values()].map((e) => `${e.id}: ${exName(e, 'en')} [${e.category}, ${e.equipment_id}, level ${e.difficulty}]`).join('\n');
  const { data, model } = await aiJson<PlanSuggestion>([
    { role: 'system', content: `${systemPrompt(lang, profile)}\nAnswer with JSON only.\n\n--- USER DATA ---\n${buildContext(prefs, profile, lang)}` },
    { role: 'user', content: `Create a weekly workout plan for me that fits my goals, experience, training days per week and available equipment.${wish ? ` My wish: "${wish}".` : ''}
Use ONLY exercises from this library (use the id exactly):
${library}
Rules: 2–6 training days, 4–7 exercises per day, sensible sets (2–5), reps as text like "8-12", rest in seconds (45–180). Include rest days implicitly by not exceeding my training days per week. Write "name", day names and "notes" in ${LANG_NAME[lang]}; "notes" = 1–2 sentences explaining the plan and recovery.
Answer ONLY with JSON: {"name": "...", "notes": "...", "days": [{"name": "...", "exercises": [{"id": "ex_...", "sets": 3, "reps": "8-12", "rest": 90}]}]}` },
  ], { temperature: 0.4, signal });
  const ids = getExerciseMap();
  const days = (Array.isArray(data?.days) ? data.days : []).map((d) => ({
    name: String(d?.name ?? '').slice(0, 40),
    exercises: (Array.isArray(d?.exercises) ? d.exercises : []).filter((x) => ids.has(String(x?.id))).slice(0, 10).map((x) => ({
      id: String(x.id),
      sets: Math.min(10, Math.max(1, Math.round(Number(x.sets) || 3))),
      reps: String(x.reps ?? '10').slice(0, 12) || '10',
      rest: Math.min(600, Math.max(0, Math.round(Number(x.rest) || 90))),
    })),
  })).filter((d) => d.exercises.length).slice(0, 7);
  if (!days.length) throw new AiError('plan without valid exercises', 'format');
  return { plan: { name: String(data.name ?? '').slice(0, 60), notes: String(data.notes ?? '').slice(0, 400), days }, model };
}
