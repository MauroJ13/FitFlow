import type { Exercise, Lang, SessionItem, WorkoutDay, WorkoutExercise, WorkoutPlan, WorkoutSession } from '../types';
import { getTable, newId, nowIso, remove, save } from './db';
import { today } from './date';
import { exName } from './hooks';

export const firstNumber = (reps: string, fallback = 10) => { const m = reps.match(/\d+/); return m ? Number(m[0]) : fallback; };

/** Start a session from a plan day. The exercises are copied so later plan edits never rewrite history. */
export function startSession(plan: WorkoutPlan, day: WorkoutDay, exercises: Map<string, Exercise>, lang: Lang): WorkoutSession {
  const items: SessionItem[] = getTable('workout_exercises')
    .filter((w) => w.day_id === day.id).sort((a, b) => a.position - b.position)
    .map((w) => {
      const ex = exercises.get(w.exercise_id);
      return { exercise_id: w.exercise_id, name: ex ? exName(ex, lang) : '?', sets: w.sets, reps: w.reps, rest_seconds: w.rest_seconds, notes: w.notes };
    });
  return save('workout_sessions', {
    date: today(), plan_id: plan.id, day_id: day.id, name: `${plan.name} · ${day.name}`,
    status: 'active', started_at: nowIso(), finished_at: null, items, notes: '',
  });
}
export function startFreeSession(name: string): WorkoutSession {
  return save('workout_sessions', {
    date: today(), plan_id: null, day_id: null, name, status: 'active', started_at: nowIso(), finished_at: null, items: [], notes: '',
  });
}
export function deleteSession(id: string) {
  getTable('completed_sets').filter((s) => s.session_id === id).forEach((s) => remove('completed_sets', s.id));
  remove('workout_sessions', id);
}

export function deletePlan(id: string) {
  getTable('workout_exercises').filter((w) => w.plan_id === id).forEach((w) => remove('workout_exercises', w.id));
  getTable('workout_days').filter((d) => d.plan_id === id).forEach((d) => remove('workout_days', d.id));
  remove('workout_plans', id);
}
export function duplicatePlan(plan: WorkoutPlan, suffix: string): WorkoutPlan {
  const copy = save('workout_plans', { name: `${plan.name} ${suffix}`, notes: plan.notes });
  for (const d of getTable('workout_days').filter((x) => x.plan_id === plan.id)) {
    const dayId = newId();
    save('workout_days', { id: dayId, plan_id: copy.id, name: d.name, position: d.position, weekdays: d.weekdays });
    for (const w of getTable('workout_exercises').filter((x) => x.day_id === d.id)) {
      save('workout_exercises', { plan_id: copy.id, day_id: dayId, exercise_id: w.exercise_id, position: w.position, sets: w.sets, reps: w.reps, rest_seconds: w.rest_seconds, notes: w.notes });
    }
  }
  return copy;
}
export const DEFAULT_WE: Pick<WorkoutExercise, 'sets' | 'reps' | 'rest_seconds' | 'notes'> = { sets: 3, reps: '10', rest_seconds: 90, notes: '' };
