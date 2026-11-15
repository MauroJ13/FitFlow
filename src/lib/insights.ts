/**
 * Rule-based pattern recognition. Works offline and without any AI provider.
 * Wording is observational – it never judges missed days.
 */
import type { AiReport, Prefs } from '../types';
import { translate, type Vars } from '../i18n';
import type { Lang } from '../types';
import { fmtDuration } from './date';
import type { PeriodStats } from './stats';

export interface Insight { key: string; vars?: Vars; kind: 'positive' | 'tip' | 'neutral' }

export function buildInsights(cur: PeriodStats, prev: PeriodStats | null, prefs: Pick<Prefs, 'sleep_pref_h'>): Insight[] {
  const out: Insight[] = [];
  const nothing = !cur.workouts && !cur.nutritionDays && !cur.sleepNights && !cur.waterDays && !cur.activityCount && !cur.habitChecks;
  if (nothing) return [{ key: 'ins.empty', kind: 'neutral' }];

  if (cur.workouts) out.push({ key: 'ins.workouts', vars: { n: cur.workouts, sets: cur.sets }, kind: 'positive' });
  if (prev && cur.workouts > prev.workouts && prev.workouts > 0) out.push({ key: 'ins.workouts_up', vars: { n: cur.workouts - prev.workouts }, kind: 'positive' });
  if (cur.activityCount) out.push({ key: 'ins.activity', vars: { n: cur.activityCount, min: cur.activityMin }, kind: 'positive' });
  if (cur.sleepNights) out.push({ key: 'ins.sleep_avg', vars: { n: cur.sleepNights, dur: fmtDuration(cur.avgSleepMin ?? 0) }, kind: 'neutral' });
  if (cur.sleepNights >= 3 && cur.bedtimeSd != null) {
    if (cur.bedtimeSd <= 30) out.push({ key: 'ins.sleep_regular', kind: 'positive' });
    else if (cur.bedtimeSd > 60) out.push({ key: 'ins.sleep_irregular', vars: { min: Math.round(cur.bedtimeSd) }, kind: 'tip' });
  }
  if (prefs.sleep_pref_h && cur.avgSleepMin != null && cur.sleepNights >= 3 && cur.avgSleepMin < prefs.sleep_pref_h * 60 - 45) {
    out.push({ key: 'ins.sleep_below_pref', vars: { h: prefs.sleep_pref_h }, kind: 'tip' });
  }
  if (cur.nutritionDays) out.push({ key: 'ins.nutrition_days', vars: { n: cur.nutritionDays }, kind: 'neutral' });
  if (cur.waterDays) out.push({ key: 'ins.water_days', vars: { n: cur.waterDays, ml: Math.round(cur.avgWaterMl ?? 0) }, kind: 'neutral' });
  if (cur.habitChecks) out.push({ key: 'ins.habits', vars: { n: cur.habitChecks }, kind: 'positive' });

  // relationships between areas (training ↔ recovery, sleep ↔ energy) – stated as observations, not certainties
  const lowSleep = cur.sleepNights >= 3 && ((cur.avgEnergy != null && cur.avgEnergy <= 2.5) || (cur.avgQuality != null && cur.avgQuality <= 2.5));
  const demanding = cur.workouts >= 3 || (cur.avgSoreness != null && cur.avgSoreness >= 4);
  if (lowSleep && demanding) out.push({ key: 'ins.combo_recovery', vars: { n: cur.workouts }, kind: 'tip' });
  else if (lowSleep) out.push({ key: 'ins.low_energy', kind: 'tip' });
  if (cur.workouts >= 4 && cur.restDays === 0 && cur.days >= 7) out.push({ key: 'ins.no_rest_days', kind: 'tip' });
  if (prev && prev.sleepNights >= 3 && cur.sleepNights >= 3 && prev.bedtimeSd != null && cur.bedtimeSd != null) {
    if (cur.bedtimeSd + 20 < prev.bedtimeSd) out.push({ key: 'ins.sleep_more_regular', kind: 'positive' });
    else if (cur.bedtimeSd > prev.bedtimeSd + 20) out.push({ key: 'ins.sleep_less_regular', kind: 'tip' });
  }

  // exactly one gentle focus for the coming week
  if (lowSleep && demanding) out.push({ key: 'ins.focus_recovery', kind: 'tip' });
  else if (cur.workouts >= 6) out.push({ key: 'ins.focus_recovery', kind: 'tip' });
  else if (cur.bedtimeSd != null && cur.bedtimeSd > 60 && cur.sleepNights >= 3) out.push({ key: 'ins.focus_bedtime', kind: 'tip' });
  else if (cur.sleepNights < 3) out.push({ key: 'ins.focus_log_sleep', kind: 'tip' });
  else out.push({ key: 'ins.focus_keep', kind: 'tip' });
  return out;
}

export const insightsText = (list: Insight[], lang: Lang) => list.map((i) => translate(i.key, i.vars, lang)).join('\n');

/** Numbers shown in a report card. Stored with the report so it stays reproducible. */
export function reportStats(s: PeriodStats): AiReport['stats'] {
  return {
    workouts: s.workouts, sets: s.sets, volume: Math.round(s.volume), nutritionDays: s.nutritionDays,
    avgKcal: s.avgKcal == null ? null : Math.round(s.avgKcal), avgProtein: s.avgProtein == null ? null : Math.round(s.avgProtein),
    sleepNights: s.sleepNights, avgSleepMin: s.avgSleepMin == null ? null : Math.round(s.avgSleepMin),
    bedtimeSd: s.bedtimeSd == null ? null : Math.round(s.bedtimeSd), avgEnergy: s.avgEnergy == null ? null : Math.round(s.avgEnergy * 10) / 10,
    waterDays: s.waterDays, avgWaterMl: s.avgWaterMl == null ? null : Math.round(s.avgWaterMl),
    activityCount: s.activityCount, activityMin: s.activityMin, habitChecks: s.habitChecks,
  };
}
