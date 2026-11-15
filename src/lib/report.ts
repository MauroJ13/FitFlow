/**
 * Weekly report. The figures are computed by the app; the AI (if enabled) only writes the narrative.
 * Generation is event-based (app start / data change after a week has ended) – nothing is sent continuously.
 */
import type { AiReport, Lang } from '../types';
import { getTable, save } from './db';
import { addDays, today, weekStart } from './date';
import { getData, periodStats } from './stats';
import { buildInsights, insightsText, reportStats } from './insights';
import { aiChat, aiEnabled, systemPrompt } from './ai';
import { getPrefs, getProfile } from './hooks';
import { getLang } from '../i18n';

export const lastFullWeek = () => addDays(weekStart(today()), -7);

export function findReport(weekStartKey: string): AiReport | undefined {
  return getTable('ai_reports').filter((r) => r.kind === 'weekly' && r.period_start === weekStartKey)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0];
}

export async function createWeeklyReport(weekStartKey: string, signedIn: boolean, lang: Lang = getLang()): Promise<AiReport> {
  const prefs = getPrefs();
  const data = getData();
  const end = addDays(weekStartKey, 6);
  const cur = periodStats(data, weekStartKey, end);
  const prev = periodStats(data, addDays(weekStartKey, -7), addDays(weekStartKey, -1));
  const insights = buildInsights(cur, prev, prefs);
  const stats = reportStats(cur);
  let content = insightsText(insights, lang);
  let source: AiReport['source'] = 'rules';
  let model = '';

  if (aiEnabled(prefs) && navigator.onLine && insights[0]?.key !== 'ins.empty') {
    try {
      const share = prefs.ai.share;
      const shared: Record<string, unknown> = {};
      if (share.workouts) Object.assign(shared, { workouts: stats.workouts, sets: stats.sets, volumeKg: stats.volume, workoutsPreviousWeek: prev.workouts });
      if (share.nutrition) Object.assign(shared, { daysWithNutritionLogged: stats.nutritionDays, avgLoggedKcal: stats.avgKcal, avgLoggedProteinG: stats.avgProtein });
      if (share.sleep) Object.assign(shared, { nightsRecorded: stats.sleepNights, avgSleepMinutes: stats.avgSleepMin, bedtimeVariationMinutes: stats.bedtimeSd, avgMorningEnergy1to5: stats.avgEnergy, avgOwnSleepRating1to5: stats.avgQuality, restDays: stats.restDays });
      if (share.hydration) Object.assign(shared, { daysWithWaterLogged: stats.waterDays, avgWaterMlOnLoggedDays: stats.avgWaterMl });
      if (share.activity) Object.assign(shared, { otherActivities: stats.activityCount, otherActivityMinutes: stats.activityMin });
      if (share.habits) Object.assign(shared, { habitCheckIns: stats.habitChecks });
      const res = await aiChat([
        { role: 'system', content: systemPrompt(lang, getProfile()) },
        {
          role: 'user',
          content: `Write my weekly report for ${weekStartKey} to ${end} in 110-160 words: what I recorded, positive observations, patterns, and one or two gentle suggestions for next week. ` +
            `Use only these figures computed by the app (null = not recorded) and do not add numbers of your own:\n${JSON.stringify(shared)}`,
        },
      ]);
      if (res.content.trim()) { content = res.content.trim(); source = 'ai'; model = res.model; }
    } catch (e) {
      console.warn('AI weekly report failed, using the rule-based report', e);
    }
  }
  const existing = findReport(weekStartKey);
  return save('ai_reports', {
    ...(existing ? { id: existing.id } : {}),
    kind: 'weekly', period_start: weekStartKey, period_end: end, stats, content, source, model, lang, seen: false,
  });
}

let checking = false;
/** Prepare last week's report once, if the user wants automatic reports and recorded anything. */
export async function ensureWeeklyReport(signedIn: boolean): Promise<boolean> {
  if (checking) return false;
  const prefs = getPrefs();
  if (!prefs.ai.auto_weekly) return false;
  const week = lastFullWeek();
  if (findReport(week)) return false;
  const s = periodStats(getData(), week, addDays(week, 6));
  if (!s.workouts && !s.nutritionDays && !s.sleepNights && !s.waterDays && !s.activityCount && !s.habitChecks) return false;
  checking = true;
  try { await createWeeklyReport(week, signedIn); return true; } finally { checking = false; }
}
