import { useMemo } from 'react';
import type { Exercise, Favorite, Food, Lang, Prefs, Profile } from '../types';
import { BUILTIN_EXERCISES, BUILTIN_FOODS, WIDGETS } from '../data';
import { getTable, remove, save, useTable } from './db';
import { getLang } from '../i18n';

/** Lower-case, accent-free text for searching (handles ä/ö/ü, č/ć/š/ž/đ). */
export const norm = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/ß/g, 'ss').trim();

const latest = <R extends { updated_at: string }>(rows: R[]): R | undefined =>
  rows.reduce<R | undefined>((a, b) => (!a || b.updated_at > a.updated_at ? b : a), undefined);

/* ---------- preferences ---------- */
export const DEFAULT_PREFS: Omit<Prefs, 'id' | 'created_at' | 'updated_at'> = {
  language: 'en',
  theme: 'dark',
  water_quick: [150, 250, 330, 500],
  water_pref_ml: null,
  sleep_pref_h: null,
  dashboard: { order: WIDGETS, hidden: [] },
  notifications: { water: false, water_every_min: 90, workout: false, workout_time: '17:00', habits: false, habits_time: '20:00', sleep: false, weekly: true, milestones: true },
  timer: { sound: true, vibrate: true },
  ai: {
    enabled: true, auto_weekly: true,
    share: { profile: true, workouts: true, nutrition: true, sleep: true, hydration: true, activity: true, habits: true },
  },
};
function mergePrefs(row: Prefs | undefined): Prefs {
  const d = DEFAULT_PREFS;
  if (!row) return { ...d, language: getLang(), id: '', created_at: '', updated_at: '' };
  return {
    ...d, ...row,
    dashboard: { ...d.dashboard, ...row.dashboard },
    notifications: { ...d.notifications, ...row.notifications },
    timer: { ...d.timer, ...row.timer },
    ai: { ...d.ai, ...row.ai, share: { ...d.ai.share, ...row.ai?.share } },
  };
}
export function usePrefs(): Prefs {
  const rows = useTable('user_preferences');
  return useMemo(() => mergePrefs(latest(rows)), [rows]);
}
export const getPrefs = (): Prefs => mergePrefs(latest(getTable('user_preferences')));
export function savePrefs(patch: Partial<Prefs>) {
  const cur = getPrefs();
  const { id, created_at, updated_at, ...rest } = cur;
  save('user_preferences', { ...rest, ...patch, ...(id ? { id } : {}) });
}

/* ---------- profile ---------- */
export const EMPTY_PROFILE: Omit<Profile, 'id' | 'created_at' | 'updated_at'> = {
  display_name: '', age: null, gender: '', experience: 'beginner', goals: [], exercise_prefs: '', equipment: [],
  dietary_prefs: '', allergies: '', sleep_bedtime: '', sleep_waketime: '', interests: '', onboarded: false,
  training_frequency: null, activities: [], avatar: null,
};
export function useProfile(): Profile | undefined {
  const rows = useTable('profiles');
  return useMemo(() => latest(rows), [rows]);
}
export const getProfile = (): Profile | undefined => latest(getTable('profiles'));
export function saveProfile(patch: Partial<Profile>) {
  const cur = getProfile();
  save('profiles', cur ? { ...patch, id: cur.id } : { ...EMPTY_PROFILE, ...patch });
}
/** Under 18: no targets, extra-careful recommendations. Unknown age is treated as adult-neutral. */
export const isMinor = (p: Profile | undefined) => p?.age != null && p.age < 18;

/* ---------- foods & exercises (built-in library + the user's own rows) ---------- */
export function useFoods() {
  const own = useTable('foods');
  return useMemo(() => {
    const list = [...own, ...BUILTIN_FOODS];
    return { list, map: new Map<string, Food>(list.map((f) => [f.id, f])) };
  }, [own]);
}
export function useExercises() {
  const own = useTable('exercises');
  return useMemo(() => {
    const list = [...own, ...BUILTIN_EXERCISES];
    return { list, map: new Map<string, Exercise>(list.map((e) => [e.id, e])) };
  }, [own]);
}
export const getExerciseMap = () => new Map<string, Exercise>([...getTable('exercises'), ...BUILTIN_EXERCISES].map((e) => [e.id, e]));
export const getFoodList = (): Food[] => [...getTable('foods'), ...BUILTIN_FOODS];
export const foodLabel = (f: Food, lang: Lang) => f.names?.[lang] ?? f.name;
export const exName = (e: Exercise, lang: Lang) => e.names?.[lang] ?? e.name;
export const exInstructions = (e: Exercise, lang: Lang) => e.instructions_i18n?.[lang] ?? e.instructions;

/* ---------- favourites ---------- */
export function useFav(kind: Favorite['kind']) {
  const rows = useTable('favorites');
  return useMemo(() => {
    const mine = new Map(rows.filter((r) => r.kind === kind).map((r) => [r.ref_id, r.id]));
    return {
      has: (id: string) => mine.has(id),
      toggle: (id: string) => { const row = mine.get(id); if (row) remove('favorites', row); else save('favorites', { kind, ref_id: id }); },
    };
  }, [rows, kind]);
}
