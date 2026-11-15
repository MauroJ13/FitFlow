import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, Copy, Info, Play, Plus, Trash2 } from 'lucide-react';
import type { Exercise, WorkoutDay, WorkoutExercise } from '../types';
import { useT } from '../i18n';
import { remove, save, useTable } from '../lib/db';
import { exName, useExercises } from '../lib/hooks';
import { DEFAULT_WE, deletePlan, duplicatePlan, startSession } from '../lib/workout';
import { ExerciseDetail, ExercisePicker } from '../components/Exercises';
import { Btn, Card, Empty, Field, IconBtn, NumInput, PageHead, TextInput, confirmDialog, cx, toast } from '../components/ui';

/** Plans save automatically: every change is written to the local database immediately. */
export default function PlanEditor() {
  const { t, lang } = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const plan = useTable('workout_plans').find((p) => p.id === id);
  const days = useTable('workout_days').filter((d) => d.plan_id === id).sort((a, b) => a.position - b.position);
  const wes = useTable('workout_exercises').filter((w) => w.plan_id === id);
  const active = useTable('workout_sessions').some((s) => s.status === 'active');
  const { map } = useExercises();
  const [pickFor, setPickFor] = useState<WorkoutDay | null>(null);
  const [detail, setDetail] = useState<Exercise | null>(null);

  if (!plan) return <div className="page"><PageHead title={t('gym.plan_not_found')} back="/gym" /></div>;

  const dayExercises = (d: WorkoutDay) => wes.filter((w) => w.day_id === d.id).sort((a, b) => a.position - b.position);
  const addDay = () => save('workout_days', { plan_id: plan.id, name: `${t('gym.day')} ${days.length + 1}`, position: days.length ? Math.max(...days.map((d) => d.position)) + 1 : 0, weekdays: [] });
  const removeDay = async (d: WorkoutDay) => {
    if (!(await confirmDialog(t('gym.delete_day_q', { name: d.name })))) return;
    dayExercises(d).forEach((w) => remove('workout_exercises', w.id));
    remove('workout_days', d.id);
  };
  const move = (list: WorkoutExercise[], i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    // rewrite positions so the order is unambiguous even after earlier deletions
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    next.forEach((w, pos) => { if (w.position !== pos) save('workout_exercises', { id: w.id, position: pos }); });
  };
  const toggleWeekday = (d: WorkoutDay, w: number) => {
    const cur = d.weekdays ?? [];
    save('workout_days', { id: d.id, weekdays: cur.includes(w) ? cur.filter((x) => x !== w) : [...cur, w].sort() });
  };

  return (
    <div className="page">
      <PageHead title={t('gym.edit_plan')} sub={t('gym.autosave')} back="/gym">
        <IconBtn label={t('c.duplicate')} onClick={() => { const c = duplicatePlan(plan, t('c.copy_suffix')); toast(t('gym.plan_duplicated')); nav(`/gym/plan/${c.id}`); }}><Copy size={20} /></IconBtn>
        <IconBtn label={t('c.delete')} onClick={async () => { if (await confirmDialog(t('gym.delete_plan_q', { name: plan.name }))) { deletePlan(plan.id); nav('/gym', { replace: true }); } }}><Trash2 size={20} /></IconBtn>
      </PageHead>

      <Card>
        <div className="stack">
          <Field label={t('gym.plan_name')}><TextInput value={plan.name} onChange={(e) => save('workout_plans', { id: plan.id, name: e.target.value })} /></Field>
          <Field label={t('c.notes')}><textarea className="input" rows={2} value={plan.notes} onChange={(e) => save('workout_plans', { id: plan.id, notes: e.target.value })} /></Field>
        </div>
      </Card>

      <div className="plan-days">
        {days.map((d) => {
          const list = dayExercises(d);
          return (
            <Card key={d.id}>
              <div className="row">
                <TextInput className="grow day-name" value={d.name} aria-label={t('gym.day_name')} onChange={(e) => save('workout_days', { id: d.id, name: e.target.value })} />
                <IconBtn label={t('gym.start')} disabled={!list.length || active} onClick={() => nav(`/gym/session/${startSession(plan, d, map, lang).id}`)}><Play size={20} /></IconBtn>
                <IconBtn label={t('c.delete')} onClick={() => removeDay(d)}><Trash2 size={18} /></IconBtn>
              </div>
              <div className="weekdays" role="group" aria-label={t('gym.weekdays')}>
                {[0, 1, 2, 3, 4, 5, 6].map((w) => (
                  <button key={w} type="button" aria-pressed={d.weekdays?.includes(w)} className={cx('chip', d.weekdays?.includes(w) && 'on')} onClick={() => toggleWeekday(d, w)}>{t(`wd.${w}`)}</button>
                ))}
              </div>
              {!list.length && <Empty title={t('gym.no_exercises')} text={t('gym.no_exercises_hint')} />}
              <ul className="list we-list">
                {list.map((w, i) => {
                  const ex = map.get(w.exercise_id);
                  return (
                    <li key={w.id} className="we">
                      <div className="row">
                        <button type="button" className="we-name grow" onClick={() => ex && setDetail(ex)}>{ex ? exName(ex, lang) : t('gym.exercise_gone')} <Info size={14} /></button>
                        <IconBtn label={t('c.up')} disabled={i === 0} onClick={() => move(list, i, -1)}><ArrowUp size={18} /></IconBtn>
                        <IconBtn label={t('c.down')} disabled={i === list.length - 1} onClick={() => move(list, i, 1)}><ArrowDown size={18} /></IconBtn>
                        <IconBtn label={t('c.delete')} onClick={() => remove('workout_exercises', w.id)}><Trash2 size={17} /></IconBtn>
                      </div>
                      <div className="grid3">
                        <Field label={t('gym.sets')}><NumInput value={w.sets} max={20} onChange={(v) => { if (v != null && v >= 1) save('workout_exercises', { id: w.id, sets: Math.round(v) }); }} /></Field>
                        <Field label={t('gym.reps')}><TextInput value={w.reps} inputMode="text" placeholder="8-12" onChange={(e) => save('workout_exercises', { id: w.id, reps: e.target.value.slice(0, 12) })} /></Field>
                        <Field label={t('gym.rest_s')}><NumInput value={w.rest_seconds} max={900} onChange={(v) => { if (v != null) save('workout_exercises', { id: w.id, rest_seconds: Math.round(v) }); }} /></Field>
                      </div>
                      <TextInput value={w.notes} placeholder={t('gym.note_ph')} aria-label={t('c.notes')} onChange={(e) => save('workout_exercises', { id: w.id, notes: e.target.value })} />
                    </li>
                  );
                })}
              </ul>
              <Btn block onClick={() => setPickFor(d)}><Plus size={18} />{t('gym.add_exercise')}</Btn>
            </Card>
          );
        })}
      </div>
      <Btn onClick={addDay}><Plus size={18} />{t('gym.add_day')}</Btn>

      <ExercisePicker open={!!pickFor} onClose={() => setPickFor(null)} onPick={(ex) => {
        if (!pickFor) return;
        const list = dayExercises(pickFor);
        save('workout_exercises', { plan_id: plan.id, day_id: pickFor.id, exercise_id: ex.id, position: list.length ? Math.max(...list.map((w) => w.position)) + 1 : 0, ...DEFAULT_WE });
        toast(t('gym.exercise_added', { name: exName(ex, lang) }));
      }} />
      <ExerciseDetail exercise={detail} onClose={() => setDetail(null)} onOpen={setDetail} />
    </div>
  );
}
