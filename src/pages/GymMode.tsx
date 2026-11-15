import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Info, Plus, Trash2, Undo2, X } from 'lucide-react';
import type { Exercise } from '../types';
import { useT } from '../i18n';
import { nowIso, remove, save, useTable } from '../lib/db';
import { exName, useExercises, usePrefs } from '../lib/hooks';
import { keepAwake, primeAudio } from '../lib/notify';
import { DEFAULT_WE, deleteSession, firstNumber } from '../lib/workout';
import { ExerciseDetail, ExercisePicker } from '../components/Exercises';
import { RestTimer, useRestTimer } from '../components/RestTimer';
import { Btn, Empty, IconBtn, NumInput, confirmDialog, toast } from '../components/ui';

/** Full-screen workout mode: one exercise at a time, big controls, nothing else. */
export default function GymMode() {
  const { t, lang, num, date: fmt } = useT();
  const { id } = useParams();
  const nav = useNavigate();
  const prefs = usePrefs();
  const session = useTable('workout_sessions').find((s) => s.id === id);
  const allSets = useTable('completed_sets');
  const { map } = useExercises();
  const timer = useRestTimer(prefs.timer);

  const [idx, setIdx] = useState(0);
  const [reps, setReps] = useState<number | null>(null);
  const [weight, setWeight] = useState<number | null>(null);
  const [picker, setPicker] = useState(false);
  const [info, setInfo] = useState<Exercise | null>(null);

  const sets = useMemo(() => allSets.filter((s) => s.session_id === id), [allSets, id]);
  const items = session?.items ?? [];
  const item = items[Math.min(idx, Math.max(0, items.length - 1))];
  const doneHere = sets.filter((s) => s.item_index === idx).sort((a, b) => a.set_number - b.set_number);
  /** The most recent earlier session that contains this exercise – shown as a reference, never as a target. */
  const previous = useMemo(() => {
    if (!item) return [];
    const earlier = allSets.filter((s) => s.exercise_id === item.exercise_id && s.session_id !== id).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return earlier.length ? earlier.filter((s) => s.session_id === earlier[0].session_id).sort((a, b) => a.set_number - b.set_number) : [];
  }, [allSets, item, id]);

  // Start at the first exercise that still has open sets (e.g. after resuming).
  useEffect(() => {
    if (!session) return;
    const first = session.items.findIndex((it, i) => allSets.filter((s) => s.session_id === id && s.item_index === i).length < it.sets);
    setIdx(first === -1 ? Math.max(0, session.items.length - 1) : first);
  }, [session?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill the inputs: target reps, and the weight used last (this session first, then last time).
  useEffect(() => {
    if (!item) return;
    const last = doneHere[doneHere.length - 1];
    setReps(last?.reps ?? firstNumber(item.reps));
    setWeight(last?.weight ?? previous[doneHere.length]?.weight ?? previous[previous.length - 1]?.weight ?? null);
  }, [idx, item?.exercise_id, doneHere.length]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void keepAwake(true); return () => { void keepAwake(false); }; }, []);

  if (!session) {
    return <div className="gm"><Empty title={t('gm.not_found')}><Btn variant="primary" onClick={() => nav('/gym')}>{t('nav.gym')}</Btn></Empty></div>;
  }

  const total = items.reduce((n, it) => n + it.sets, 0);
  const completed = items.reduce((n, it, i) => n + Math.min(it.sets, sets.filter((s) => s.item_index === i).length), 0);
  const ex = item ? map.get(item.exercise_id) : undefined;
  const name = item ? (ex ? exName(ex, lang) : item.name) : '';
  const targetDone = item ? doneHere.length >= item.sets : false;
  const isLast = idx >= items.length - 1;
  const readOnly = session.status === 'done';

  const completeSet = () => {
    if (!item || reps == null || reps <= 0) return;
    primeAudio();
    const best = Math.max(0, ...allSets.filter((s) => s.exercise_id === item.exercise_id).map((s) => s.weight ?? 0));
    if (weight && best > 0 && weight > best) toast(t('gm.new_record', { kg: num(weight, 1) }));
    save('completed_sets', { session_id: session.id, exercise_id: item.exercise_id, exercise_name: name, item_index: idx, set_number: doneHere.length + 1, reps: Math.round(reps), weight: weight && weight > 0 ? weight : null, date: session.date });
    const lastOfWorkout = isLast && doneHere.length + 1 >= item.sets;
    if (!lastOfWorkout) timer.start(item.rest_seconds);
  };
  const undo = () => { const last = doneHere[doneHere.length - 1]; if (last) remove('completed_sets', last.id); };
  const go = (dir: -1 | 1) => { timer.skip(); setIdx(Math.min(items.length - 1, Math.max(0, idx + dir))); };
  const setItemNote = (notes: string) => save('workout_sessions', { id: session.id, items: items.map((it, i) => (i === idx ? { ...it, notes } : it)) });
  const finish = async () => {
    if (completed < total && !(await confirmDialog(t('gm.finish_q', { done: completed, total }), { ok: t('gm.finish'), danger: false }))) return;
    timer.skip();
    save('workout_sessions', { id: session.id, status: 'done', finished_at: nowIso() });
    toast(t('gm.finished'));
    nav('/calendar', { replace: true });
  };
  const discard = async () => {
    if (!(await confirmDialog(t('gm.discard_q')))) return;
    deleteSession(session.id);
    nav('/gym', { replace: true });
  };

  return (
    <div className="gm">
      <header className="gm-head">
        <IconBtn label={t('gm.leave')} onClick={() => nav('/gym')}><X size={22} /></IconBtn>
        <div className="grow">
          <p className="gm-title">{session.name}</p>
          <div className="bar" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={completed}><i style={{ width: `${total ? (completed / total) * 100 : 0}%` }} /></div>
          <p className="muted small">{readOnly ? fmt(session.date) : t('gm.progress', { done: completed, total })}</p>
        </div>
        {!readOnly && <IconBtn label={t('gm.discard')} onClick={discard}><Trash2 size={20} /></IconBtn>}
      </header>

      {!item ? (
        <Empty title={t('gm.empty')} text={t('gm.empty_hint')}>
          <Btn variant="primary" onClick={() => setPicker(true)}><Plus size={18} />{t('gym.add_exercise')}</Btn>
        </Empty>
      ) : (
        <main className="gm-body">
          <p className="muted small">{t('gm.exercise_of', { i: idx + 1, n: items.length })}</p>
          <button type="button" className="gm-exercise" onClick={() => ex && setInfo(ex)}>{name} {ex && <Info size={18} />}</button>
          <p className="gm-target">{item.sets} × {item.reps}<span className="muted"> · {t('gm.rest')} {item.rest_seconds} s</span></p>
          {previous.length > 0 && (
            <p className="muted small">{t('gm.last_time')}: {previous.map((p) => `${p.reps}${p.weight ? `×${num(p.weight, 1)}` : ''}`).join(' · ')}{previous.some((p) => p.weight) ? ' kg' : ''}</p>
          )}

          <div className="gm-sets">
            {Array.from({ length: Math.max(item.sets, doneHere.length) }, (_, i) => {
              const s = doneHere[i];
              return (
                <div key={i} className={`gm-set ${s ? 'done' : i === doneHere.length ? 'current' : ''}`}>
                  <span className="gm-set-n">{s ? <Check size={16} /> : i + 1}</span>
                  <span>{s ? `${s.reps}${s.weight ? ` × ${num(s.weight, 1)} kg` : ''}` : item.reps}</span>
                </div>
              );
            })}
          </div>

          {timer.active ? <RestTimer timer={timer} /> : !readOnly && (
            <div className="gm-entry">
              <label><span className="muted small">{t('gym.reps')}</span><NumInput className="gm-input" value={reps} onChange={setReps} max={999} aria-label={t('gym.reps')} /></label>
              <label><span className="muted small">{t('gm.weight')}</span><NumInput className="gm-input" value={weight} onChange={setWeight} max={999} placeholder="–" aria-label={t('gm.weight')} /></label>
              <Btn variant="primary" className="gm-complete" disabled={reps == null || reps <= 0} onClick={completeSet}>
                <Check size={22} />{targetDone ? t('gm.extra_set') : t('gm.complete_set', { n: doneHere.length + 1 })}
              </Btn>
            </div>
          )}
          {!readOnly && doneHere.length > 0 && !timer.active && <button type="button" className="textlink" onClick={undo}><Undo2 size={14} /> {t('gm.undo')}</button>}

          {!readOnly && !isLast && <button type="button" className="textlink" onClick={finish}>{t('gm.finish_early')}</button>}
          <textarea className="input gm-note" rows={2} value={item.notes} readOnly={readOnly} placeholder={t('gm.note_ph')} aria-label={t('c.notes')} onChange={(e) => setItemNote(e.target.value)} />
        </main>
      )}

      {items.length > 0 && (
        <footer className="gm-foot">
          <Btn onClick={() => go(-1)} disabled={idx === 0} aria-label={t('c.prev')}><ChevronLeft size={20} /></Btn>
          {!readOnly && <Btn onClick={() => setPicker(true)} aria-label={t('gym.add_exercise')}><Plus size={20} /></Btn>}
          {isLast
            ? (readOnly ? <Btn variant="primary" className="grow" onClick={() => nav('/gym')}>{t('c.close')}</Btn> : <Btn variant={targetDone ? 'primary' : 'soft'} className="grow" onClick={finish}>{t('gm.finish')}</Btn>)
            : <Btn variant={targetDone ? 'primary' : 'soft'} className="grow" onClick={() => go(1)}>{t('gm.next')}<ChevronRight size={20} /></Btn>}
        </footer>
      )}

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={(e) => {
        save('workout_sessions', { id: session.id, items: [...items, { exercise_id: e.id, name: exName(e, lang), ...DEFAULT_WE }] });
        setIdx(items.length); setPicker(false); timer.skip();
      }} />
      <ExerciseDetail exercise={info} onClose={() => setInfo(null)} onOpen={setInfo} />
    </div>
  );
}
