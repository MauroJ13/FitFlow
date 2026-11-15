/**
 * Achievements are based on cumulative totals, never on unbroken streaks,
 * so a missed day can not take anything away.
 */
import { getTable, save } from './db';
import { nowIso } from './db';
import { getData } from './stats';
import { weekStart } from './date';

export interface AchievementDef { key: string; check: (c: Counts) => boolean }
interface Counts {
  workouts: number; workoutWeeks: number; recipes: number; nutritionDays: number; sleepNights: number;
  waterDays: number; habitChecks: number; activities: number; reflections: number; plans: number;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { key: 'first_workout', check: (c) => c.workouts >= 1 },
  { key: 'workouts_10', check: (c) => c.workouts >= 10 },
  { key: 'workouts_25', check: (c) => c.workouts >= 25 },
  { key: 'workouts_50', check: (c) => c.workouts >= 50 },
  { key: 'weeks_4', check: (c) => c.workoutWeeks >= 4 },
  { key: 'weeks_12', check: (c) => c.workoutWeeks >= 12 },
  { key: 'first_plan', check: (c) => c.plans >= 1 },
  { key: 'first_recipe', check: (c) => c.recipes >= 1 },
  { key: 'nutrition_7', check: (c) => c.nutritionDays >= 7 },
  { key: 'sleep_7', check: (c) => c.sleepNights >= 7 },
  { key: 'sleep_30', check: (c) => c.sleepNights >= 30 },
  { key: 'water_7', check: (c) => c.waterDays >= 7 },
  { key: 'habits_20', check: (c) => c.habitChecks >= 20 },
  { key: 'active_5', check: (c) => c.activities >= 5 },
  { key: 'reflection_1', check: (c) => c.reflections >= 1 },
];

/** Unlock anything newly earned. Returns the keys unlocked by this call. */
export function checkAchievements(): string[] {
  const d = getData();
  const counts: Counts = {
    workouts: d.sessions.length,
    workoutWeeks: new Set(d.sessions.map((s) => weekStart(s.date))).size,
    recipes: getTable('recipes').length,
    nutritionDays: new Set(d.entries.map((e) => e.date)).size,
    sleepNights: d.sleep.length,
    waterDays: new Set(d.water.map((w) => w.date)).size,
    habitChecks: d.habitLogs.length,
    activities: d.activities.length,
    reflections: getTable('reflections').filter((r) => r.text.trim()).length,
    plans: getTable('workout_plans').length,
  };
  const have = new Set(getTable('achievements').map((a) => a.key));
  const fresh: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (!have.has(a.key) && a.check(counts)) { save('achievements', { key: a.key, unlocked_at: nowIso() }); fresh.push(a.key); }
  }
  return fresh;
}
