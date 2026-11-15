/**
 * Local-first data store.
 * Every table lives in IndexedDB and is mirrored in memory for instant, reactive reads.
 * Writes never wait for the network: rows are marked dirty and pushed by lib/sync.ts.
 */
import { useSyncExternalStore } from 'react';
import type * as T from '../types';
import { idbAll, idbClear, idbGet, idbPut, idbPutMany, openDb } from './idb';

/** Order matters: parents before children (foreign keys on the server). */
export const TABLES = [
  'profiles', 'user_preferences', 'foods', 'recipes', 'recipe_ingredients', 'food_entries',
  'exercises', 'workout_plans', 'workout_days', 'workout_exercises', 'workout_sessions', 'completed_sets',
  'calendar_notes', 'sleep_records', 'recovery_logs', 'hydration_records', 'activity_records',
  'habits', 'habit_logs', 'goals', 'goal_milestones', 'achievements', 'ai_reports', 'reflections', 'favorites',
] as const;
export type TableName = (typeof TABLES)[number];

export interface TableMap {
  profiles: T.Profile; user_preferences: T.Prefs; foods: T.Food; recipes: T.Recipe;
  recipe_ingredients: T.RecipeIngredient; food_entries: T.FoodEntry; exercises: T.Exercise;
  workout_plans: T.WorkoutPlan; workout_days: T.WorkoutDay; workout_exercises: T.WorkoutExercise;
  workout_sessions: T.WorkoutSession; completed_sets: T.CompletedSet; calendar_notes: T.CalendarNote;
  sleep_records: T.SleepRecord; hydration_records: T.HydrationRecord; activity_records: T.ActivityRecord;
  habits: T.Habit; habit_logs: T.HabitLog; achievements: T.Achievement; ai_reports: T.AiReport;
  reflections: T.Reflection; favorites: T.Favorite; recovery_logs: T.RecoveryLog; goals: T.Goal; goal_milestones: T.GoalMilestone;
}

const mem = new Map<TableName, Map<string, T.Base>>();
const snapshots = new Map<TableName, T.Base[]>();
const subscribers = new Set<() => void>();
let userId: string | null = null;
let changeHook: (() => void) | null = null;

const subscribe = (fn: () => void) => { subscribers.add(fn); return () => { subscribers.delete(fn); }; };
function emit(table: TableName) { snapshots.delete(table); subscribers.forEach((f) => f()); }

export const nowIso = () => new Date().toISOString();
export function newId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function initDb(): Promise<void> {
  await openDb(TABLES);
  await Promise.all(TABLES.map(async (t) => {
    const rows = await idbAll<T.Base>(t);
    mem.set(t, new Map(rows.map((r) => [r.id, r])));
  }));
  TABLES.forEach((t) => snapshots.delete(t));
  subscribers.forEach((f) => f());
}

export function setUserId(id: string | null) { userId = id; }
export function onLocalChange(fn: () => void) { changeHook = fn; }

/** All live (not deleted) rows of a table. The array identity is stable until the table changes. */
export function getTable<K extends TableName>(table: K): TableMap[K][] {
  let snap = snapshots.get(table);
  if (!snap) {
    snap = [...(mem.get(table)?.values() ?? [])].filter((r) => !r.deleted);
    snapshots.set(table, snap);
  }
  return snap as TableMap[K][];
}
export function useTable<K extends TableName>(table: K): TableMap[K][] {
  return useSyncExternalStore(subscribe, () => getTable(table));
}
export function getRow<K extends TableName>(table: K, id: string): TableMap[K] | undefined {
  const r = mem.get(table)?.get(id);
  return r && !r.deleted ? (r as TableMap[K]) : undefined;
}

function write(table: TableName, row: T.Base) {
  mem.get(table)!.set(row.id, row);
  idbPut(table, row).catch((e) => console.error('IndexedDB write failed', e));
  emit(table);
  changeHook?.();
}

/** Insert or update. Pass an id to update an existing row. Returns the stored row. */
export function save<K extends TableName>(table: K, patch: Partial<TableMap[K]>): TableMap[K] {
  const now = nowIso();
  const prev = patch.id ? mem.get(table)!.get(patch.id) : undefined;
  const row = {
    ...(prev ?? { id: patch.id ?? newId(), created_at: now, user_id: userId }),
    ...patch,
    updated_at: now,
    deleted: false,
    _dirty: 1,
  } as T.Base;
  write(table, row);
  return row as TableMap[K];
}

/** Soft delete: the tombstone is synchronised so other devices drop the row too. */
export function remove(table: TableName, id: string) {
  const prev = mem.get(table)!.get(id);
  if (!prev || prev.deleted) return;
  write(table, { ...prev, deleted: true, updated_at: nowIso(), _dirty: 1 });
}

/* ---------- used by the sync engine ---------- */

export function dirtyRows(table: TableName): T.Base[] {
  return [...(mem.get(table)?.values() ?? [])].filter((r) => r._dirty);
}
export function countDirty(): number {
  let n = 0;
  for (const t of TABLES) for (const r of mem.get(t)?.values() ?? []) if (r._dirty) n++;
  return n;
}
export function markClean(table: TableName, pushed: T.Base[]) {
  const m = mem.get(table)!;
  const done: T.Base[] = [];
  for (const p of pushed) {
    const cur = m.get(p.id);
    if (cur && cur.updated_at === p.updated_at) { const c = { ...cur, _dirty: 0 }; m.set(c.id, c); done.push(c); }
  }
  if (done.length) idbPutMany(table, done).catch(console.error);
}
/** Merge rows pulled from the server. A newer unsynchronised local edit always wins. */
export function applyRemote(table: TableName, rows: T.Base[]) {
  if (!rows.length) return;
  const m = mem.get(table)!;
  const changed: T.Base[] = [];
  for (const r of rows) {
    const local = m.get(r.id);
    if (local?._dirty && Date.parse(local.updated_at) >= Date.parse(r.updated_at)) continue;
    const row = { ...r, _dirty: 0 };
    m.set(row.id, row);
    changed.push(row);
  }
  if (changed.length) { idbPutMany(table, changed).catch(console.error); emit(table); }
}

export async function wipeLocal(): Promise<void> {
  await Promise.all([...TABLES.map((t) => idbClear(t)), idbClear('meta')]);
  TABLES.forEach((t) => { mem.set(t, new Map()); snapshots.delete(t); });
  subscribers.forEach((f) => f());
}

export const getMeta = <V>(key: string) => idbGet<V>('meta', key);
export const setMeta = (key: string, value: unknown) => idbPut('meta', value, key);

/** Everything the user stored, for the JSON export. */
export function exportAll(): Record<string, unknown[]> {
  const out: Record<string, unknown[]> = {};
  for (const t of TABLES) out[t] = getTable(t).map(({ _dirty, ...r }) => r);
  return out;
}
