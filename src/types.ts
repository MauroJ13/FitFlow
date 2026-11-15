export type Lang = 'en' | 'de' | 'hr';
export type I18nText = Partial<Record<Lang, string>>;

/** Columns shared by every synchronised table. */
export interface Base {
  id: string;
  user_id?: string | null;
  created_at: string;
  updated_at: string;
  deleted?: boolean;
  /** Local only: 1 while the row still has to be pushed to Supabase. */
  _dirty?: number;
}

export type Nutrient = 'kcal' | 'protein' | 'carbs' | 'fat' | 'fiber';
/** Values per 100 g for foods, absolute values for diary entries. null = unknown. */
export type Nutrients = Record<Nutrient, number | null>;
export type FoodState = 'raw' | 'cooked' | 'na';
export type Unit = 'g' | 'ml' | 'tsp' | 'tbsp' | 'cup' | 'piece';
export type Meal = 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface Food extends Base, Nutrients {
  name: string;
  names?: I18nText | null;
  brand?: string | null;
  state: FoodState;
  /** g per ml, if known. */
  density: number | null;
  /** g per piece / slice, if known. */
  piece_g: number | null;
  source: 'builtin' | 'custom' | 'off';
  barcode?: string | null;
}

export interface FoodEntry extends Base, Nutrients {
  date: string;
  meal: Meal;
  food_id: string | null;
  recipe_id: string | null;
  label: string;
  amount: number;
  unit: Unit | 'portion';
  grams: number | null;
  /** true if a household unit or incomplete data made this an approximation. */
  estimated: boolean;
}

export interface Recipe extends Base { name: string; portions: number; notes: string }
export interface RecipeIngredient extends Base {
  recipe_id: string; food_id: string; label: string; amount: number; unit: Unit; grams: number; position: number;
}

export interface Exercise extends Base {
  name: string;
  names?: I18nText | null;
  category: string;
  equipment_id: string;
  muscles: string[];
  secondary: string[];
  difficulty: number;
  instructions: string;
  instructions_i18n?: I18nText | null;
  tips: string[];
  safety: string;
  source: 'builtin' | 'custom';
}

export interface WorkoutPlan extends Base { name: string; notes: string }
export interface WorkoutDay extends Base { plan_id: string; name: string; position: number; weekdays: number[] }
export interface WorkoutExercise extends Base {
  plan_id: string; day_id: string; exercise_id: string; position: number;
  sets: number; reps: string; rest_seconds: number; notes: string;
}
export interface SessionItem { exercise_id: string; name: string; sets: number; reps: string; rest_seconds: number; notes: string }
export interface WorkoutSession extends Base {
  date: string; plan_id: string | null; day_id: string | null; name: string;
  status: 'active' | 'done'; started_at: string; finished_at: string | null;
  items: SessionItem[]; notes: string;
}
export interface CompletedSet extends Base {
  session_id: string; exercise_id: string; exercise_name: string; item_index: number;
  set_number: number; reps: number; weight: number | null; date: string;
}

export interface CalendarNote extends Base { date: string; note: string }
export interface SleepRecord extends Base {
  date: string; bedtime: string; wake_time: string; duration_min: number; energy: number | null;
  /** Subjective rating 1–5 entered by the user (not a measurement). */
  quality: number | null; notes: string;
}
export interface RecoveryLog extends Base { date: string; rest_day: boolean; soreness: number | null; stress: number | null; notes: string }
export interface Goal extends Base {
  title: string; category: string; target: number | null; unit: string; current: number;
  due: string | null; status: 'active' | 'done'; completed_at: string | null; notes: string;
}
export interface GoalMilestone extends Base { goal_id: string; title: string; done: boolean; position: number }
export interface HydrationRecord extends Base { date: string; time: string; amount_ml: number }
export interface ActivityRecord extends Base {
  date: string; type: string; duration_min: number; distance_km: number | null; steps: number | null; notes: string;
}
export interface Habit extends Base { name: string; position: number; archived: boolean }
export interface HabitLog extends Base { habit_id: string; date: string }
export interface Achievement extends Base { key: string; unlocked_at: string }
export interface Reflection extends Base { week_start: string; text: string }
export interface Favorite extends Base { kind: 'food' | 'exercise' | 'recipe'; ref_id: string }
export interface AiReport extends Base {
  kind: 'weekly'; period_start: string; period_end: string;
  stats: Record<string, number | null>; content: string; source: 'ai' | 'rules'; model: string; lang: Lang; seen: boolean;
}

export interface Profile extends Base {
  display_name: string; age: number | null; gender: string; experience: string; goals: string[];
  exercise_prefs: string; equipment: string[]; dietary_prefs: string; allergies: string;
  sleep_bedtime: string; sleep_waketime: string; interests: string; onboarded: boolean;
  training_frequency: number | null; activities: string[];
  /** Small JPEG data URL (≤ 128 px). */
  avatar: string | null;
}

export type ShareKey = 'profile' | 'workouts' | 'nutrition' | 'sleep' | 'hydration' | 'activity' | 'habits';
export interface AiPrefs {
  /** AI features on/off (privacy choice). There is no provider or key to configure. */
  enabled: boolean;
  auto_weekly: boolean;
  share: Record<ShareKey, boolean>;
}
export interface Prefs extends Base {
  language: Lang;
  theme: 'dark' | 'light';
  water_quick: number[];
  water_pref_ml: number | null;
  sleep_pref_h: number | null;
  dashboard: { order: string[]; hidden: string[] };
  notifications: {
    water: boolean; water_every_min: number;
    workout: boolean; workout_time: string; habits: boolean; habits_time: string;
    sleep: boolean; weekly: boolean; milestones: boolean;
  };
  timer: { sound: boolean; vibrate: boolean };
  ai: AiPrefs;
}
