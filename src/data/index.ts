import type { Exercise, Food, FoodState, I18nText, Meal } from '../types';
import foodsRaw from './foods.json';
import exercisesRaw from './exercises.json';

export const MEALS: Meal[] = ['breakfast', 'lunch', 'dinner', 'snack'];
export const CATEGORIES = ['chest', 'back', 'shoulders', 'arms', 'legs', 'core', 'cardio', 'mobility'];
export const EQUIPMENT = [
  'barbell', 'dumbbell', 'kettlebell', 'machine', 'cable', 'cardio_machine', 'bench',
  'pullup_bar', 'band', 'mat', 'foam_roller', 'bodyweight', 'other',
];
export const MUSCLES = [
  'chest', 'front_delts', 'side_delts', 'rear_delts', 'biceps', 'triceps', 'forearms', 'lats', 'traps',
  'upper_back', 'lower_back', 'abs', 'obliques', 'glutes', 'quads', 'hamstrings', 'calves',
  'adductors', 'abductors', 'hip_flexors', 'heart',
];
export const GOALS = ['fitness', 'strength', 'muscle', 'endurance', 'mobility', 'consistency', 'lifestyle', 'recomp', 'nutrition', 'recovery', 'sleep'];
export const GOAL_CATEGORIES = ['training', 'strength', 'endurance', 'mobility', 'sleep', 'nutrition', 'habit', 'other'];
export const ACTIVITY_TYPES = ['walk', 'run', 'cycle', 'swim', 'hike', 'sport', 'movement', 'other'];
export const EXPERIENCE = ['beginner', 'intermediate', 'advanced'];
export const GENDERS = ['', 'female', 'male', 'diverse'];
export const SAFETY_TIPS = ['spine', 'controlled', 'spotter', 'knees', 'shoulders', 'warmup', 'breathe', 'gradual', 'pain', 'setup', 'range'];
export const WIDGETS = ['motivation', 'today', 'ai', 'workout', 'water', 'habits', 'insights', 'nutrition', 'goals', 'week', 'activity', 'report', 'milestones'];

type FoodRow = [string, string, string, string, string, number, number, number, number, number, number | null, number | null];

/** Reference ingredients shipped with the app (typical average values per 100 g). */
export const BUILTIN_FOODS: Food[] = (foodsRaw as unknown as FoodRow[]).map((r) => ({
  id: r[0], name: r[1], names: { en: r[1], de: r[2], hr: r[3] }, state: r[4] as FoodState,
  kcal: r[5], protein: r[6], carbs: r[7], fat: r[8], fiber: r[9], density: r[10], piece_g: r[11],
  source: 'builtin', brand: null, barcode: null, created_at: '', updated_at: '', user_id: null,
}));

interface ExerciseRow {
  id: string; cat: string; eq: string; diff: number; m: string[]; s: string[]; tips: string[]; n: I18nText; i: I18nText;
}
export const BUILTIN_EXERCISES: Exercise[] = (exercisesRaw as ExerciseRow[]).map((r) => ({
  id: r.id, name: r.n.en ?? r.id, names: r.n, category: r.cat, equipment_id: r.eq, muscles: r.m, secondary: r.s,
  difficulty: r.diff, instructions: r.i.en ?? '', instructions_i18n: r.i, tips: r.tips, safety: '',
  source: 'builtin', created_at: '', updated_at: '', user_id: null,
}));
