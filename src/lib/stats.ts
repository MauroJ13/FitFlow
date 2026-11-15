/**
 * Read-only views over the stored records: per-day summaries (calendar, dashboard)
 * and per-period statistics (analytics, weekly report). Only real stored data is used.
 */
import { useMemo } from 'react';
import type { ActivityRecord, CompletedSet, FoodEntry, Habit, HabitLog, HydrationRecord, RecoveryLog, SleepRecord, WorkoutSession } from '../types';
import { getTable, useTable } from './db';
import { bedAxis, rangeDays } from './date';
import { sumNutrients, type Totals } from './nutrition';

export interface DaySummary {
  date: string;
  sessions: WorkoutSession[];
  sets: CompletedSet[];
  entries: FoodEntry[];
  nutrition: Totals;
  sleep: SleepRecord | undefined;
  recovery: RecoveryLog | undefined;
  water: HydrationRecord[];
  waterMl: number;
  activities: ActivityRecord[];
  habitLogs: HabitLog[];
  note: string;
  /** Which kinds of activity were RECORDED that day (says nothing about goals). */
  has: { gym: boolean; nutrition: boolean; sleep: boolean; habits: boolean; water: boolean; activity: boolean };
}

function group<R extends { date: string }>(rows: R[]): Map<string, R[]> {
  const m = new Map<string, R[]>();
  for (const r of rows) { const a = m.get(r.date); if (a) a.push(r); else m.set(r.date, [r]); }
  return m;
}

export interface Data {
  sessions: WorkoutSession[]; sets: CompletedSet[]; entries: FoodEntry[]; sleep: SleepRecord[];
  water: HydrationRecord[]; activities: ActivityRecord[]; habits: Habit[]; habitLogs: HabitLog[];
  day: (date: string) => DaySummary;
}

function build(
  sessionsAll: WorkoutSession[], sets: CompletedSet[], entries: FoodEntry[], sleep: SleepRecord[], water: HydrationRecord[],
  activities: ActivityRecord[], habits: Habit[], habitLogsAll: HabitLog[], notes: { date: string; note: string }[], recovery: RecoveryLog[],
): Data {
  const sessions = sessionsAll.filter((s) => s.status === 'done');
  const habitIds = new Set(habits.map((h) => h.id));
  const habitLogs = habitLogsAll.filter((l) => habitIds.has(l.habit_id));
  const g = {
    sessions: group(sessions), sets: group(sets), entries: group(entries), sleep: group(sleep),
    water: group(water), activities: group(activities), habitLogs: group(habitLogs), notes: group(notes), recovery: group(recovery),
  };
  const cache = new Map<string, DaySummary>();
  const day = (date: string): DaySummary => {
    let d = cache.get(date);
    if (d) return d;
    const sess = g.sessions.get(date) ?? [];
    const sessIds = new Set(sess.map((s) => s.id));
    const ent = g.entries.get(date) ?? [];
    const w = g.water.get(date) ?? [];
    const sl = (g.sleep.get(date) ?? [])[0];
    const act = g.activities.get(date) ?? [];
    const hl = g.habitLogs.get(date) ?? [];
    d = {
      date, sessions: sess, sets: (g.sets.get(date) ?? []).filter((s) => sessIds.has(s.session_id)), entries: ent,
      nutrition: sumNutrients(ent), sleep: sl, recovery: (g.recovery.get(date) ?? [])[0], water: w, waterMl: w.reduce((s, r) => s + r.amount_ml, 0),
      activities: act, habitLogs: hl, note: (g.notes.get(date) ?? [])[0]?.note ?? '',
      has: { gym: sess.length > 0, nutrition: ent.length > 0, sleep: !!sl, habits: hl.length > 0, water: w.length > 0, activity: act.length > 0 },
    };
    cache.set(date, d);
    return d;
  };
  return { sessions, sets, entries, sleep, water, activities, habits: habits.filter((h) => !h.archived), habitLogs, day };
}

export function useData(): Data {
  const a = useTable('workout_sessions'), b = useTable('completed_sets'), c = useTable('food_entries'), d = useTable('sleep_records');
  const e = useTable('hydration_records'), f = useTable('activity_records'), g = useTable('habits'), h = useTable('habit_logs'), i = useTable('calendar_notes');
  const j = useTable('recovery_logs');
  return useMemo(() => build(a, b, c, d, e, f, g, h, i, j), [a, b, c, d, e, f, g, h, i, j]);
}
export const getData = (): Data => build(
  getTable('workout_sessions'), getTable('completed_sets'), getTable('food_entries'), getTable('sleep_records'),
  getTable('hydration_records'), getTable('activity_records'), getTable('habits'), getTable('habit_logs'), getTable('calendar_notes'), getTable('recovery_logs'),
);

const avg = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
const sd = (xs: number[]) => {
  const m = avg(xs);
  return m == null || xs.length < 2 ? null : Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
};

/** Every value is null when nothing was recorded – never a made-up number. */
export interface PeriodStats {
  days: number;
  workouts: number;
  sets: number;
  /** Sum of reps × weight for sets that have a weight (kg). */
  volume: number;
  nutritionDays: number;
  avgKcal: number | null;
  avgProtein: number | null;
  sleepNights: number;
  avgSleepMin: number | null;
  /** Standard deviation of bedtime in minutes (lower = more regular). */
  bedtimeSd: number | null;
  avgEnergy: number | null;
  /** Average of the user's own 1–5 sleep rating. */
  avgQuality: number | null;
  restDays: number;
  avgSoreness: number | null;
  waterDays: number;
  avgWaterMl: number | null;
  activityCount: number;
  activityMin: number;
  habitChecks: number;
  activeDays: number;
}
export function periodStats(data: Data, from: string, to: string): PeriodStats {
  const days = rangeDays(from, to).map(data.day);
  const logged = days.filter((d) => d.has.nutrition);
  const nights = days.map((d) => d.sleep).filter((s): s is SleepRecord => !!s);
  const wdays = days.filter((d) => d.has.water);
  const energy = nights.map((n) => n.energy).filter((x): x is number => x != null);
  const sets = days.flatMap((d) => d.sets);
  return {
    days: days.length,
    workouts: days.reduce((s, d) => s + d.sessions.length, 0),
    sets: sets.length,
    volume: sets.reduce((s, x) => s + (x.weight ? x.weight * x.reps : 0), 0),
    nutritionDays: logged.length,
    avgKcal: avg(logged.map((d) => d.nutrition.kcal)),
    avgProtein: avg(logged.map((d) => d.nutrition.protein)),
    sleepNights: nights.length,
    avgSleepMin: avg(nights.map((n) => n.duration_min)),
    bedtimeSd: sd(nights.map((n) => bedAxis(n.bedtime))),
    avgEnergy: avg(energy),
    avgQuality: avg(nights.map((n) => n.quality).filter((x): x is number => x != null)),
    restDays: days.filter((d) => d.recovery?.rest_day).length,
    avgSoreness: avg(days.map((d) => d.recovery?.soreness).filter((x): x is number => x != null)),
    waterDays: wdays.length,
    avgWaterMl: avg(wdays.map((d) => d.waterMl)),
    activityCount: days.reduce((s, d) => s + d.activities.length, 0),
    activityMin: days.reduce((s, d) => s + d.activities.reduce((a, r) => a + r.duration_min, 0), 0),
    habitChecks: days.reduce((s, d) => s + d.habitLogs.length, 0),
    activeDays: days.filter((d) => d.has.gym || d.has.activity).length,
  };
}

export interface PersonalRecord { exercise_id: string; name: string; weight: number; reps: number; date: string }
/** Heaviest recorded set per exercise (only sets where a weight was entered). */
export function personalRecords(sets: CompletedSet[]): PersonalRecord[] {
  const best = new Map<string, PersonalRecord>();
  for (const s of sets) {
    if (!s.weight) continue;
    const cur = best.get(s.exercise_id);
    if (!cur || s.weight > cur.weight || (s.weight === cur.weight && s.reps > cur.reps)) {
      best.set(s.exercise_id, { exercise_id: s.exercise_id, name: s.exercise_name, weight: s.weight, reps: s.reps, date: s.date });
    }
  }
  return [...best.values()].sort((a, b) => b.date.localeCompare(a.date));
}
