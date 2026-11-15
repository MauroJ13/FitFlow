import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useT } from '../i18n';
import { save } from '../lib/db';
import { aiEnabled, aiErrorKey, suggestPlan, type PlanSuggestion } from '../lib/ai';
import { exName, useExercises, usePrefs, useProfile } from '../lib/hooks';
import { Btn, Field, Sheet, TextInput, toast } from './ui';

/** AI-generated weekly plan from the exercise library. Nothing is saved until the user confirms. */
export function AiPlanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t, lang } = useT();
  const nav = useNavigate();
  const prefs = usePrefs();
  const profile = useProfile();
  const { map } = useExercises();
  const [wish, setWish] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<PlanSuggestion | null>(null);
  const [model, setModel] = useState('');
  const abort = useRef<AbortController | null>(null);

  const generate = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true); setError('');
    try {
      const r = await suggestPlan(prefs, profile, lang, wish.trim(), ctrl.signal);
      setPlan(r.plan); setModel(r.model);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(t(aiErrorKey(e)));
    } finally { setBusy(false); }
  };
  const close = () => { abort.current?.abort(); setBusy(false); onClose(); };
  const create = () => {
    if (!plan) return;
    const p = save('workout_plans', { name: plan.name || t('gym.new_plan_name'), notes: plan.notes });
    plan.days.forEach((d, i) => {
      const day = save('workout_days', { plan_id: p.id, name: d.name || `${t('gym.day')} ${i + 1}`, position: i, weekdays: [] });
      d.exercises.forEach((x, j) => save('workout_exercises', { plan_id: p.id, day_id: day.id, exercise_id: x.id, position: j, sets: x.sets, reps: x.reps, rest_seconds: x.rest, notes: '' }));
    });
    toast(t('aiplan.created'));
    setPlan(null); setWish('');
    onClose();
    nav(`/gym/plan/${p.id}`);
  };

  return (
    <Sheet open={open} onClose={close} title={t('aiplan.title')}
      footer={plan && !busy ? <>
        <Btn onClick={() => void generate()}><RefreshCw size={16} />{t('aiplan.again')}</Btn>
        <Btn variant="primary" onClick={create}>{t('aiplan.create')}</Btn>
      </> : undefined}>
      {!aiEnabled(prefs) ? <p className="hint-box">{t('ai.disabled_hint')}</p> : (
        <div className="stack">
          <p className="muted small">{t('aiplan.hint')}</p>
          <Field label={t('aiplan.wish')} hint={t('aiplan.wish_hint')}>
            <TextInput value={wish} maxLength={200} placeholder={t('aiplan.wish_ph')} onChange={(e) => setWish(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !busy) void generate(); }} />
          </Field>
          {!plan && <Btn variant="primary" block disabled={busy} onClick={() => void generate()}><Sparkles size={16} />{busy ? t('ai.thinking') : t('aiplan.generate')}</Btn>}
          {busy && <div className="ai-skeleton"><span className="sk w60" /><span className="sk" /><span className="sk w80" /><p className="muted small">{t('aiplan.working')}</p></div>}
          {error && <p className="warn-box" role="alert">{error}</p>}
          {plan && !busy && (
            <div className="stack">
              <div>
                <h3 className="card-title">{plan.name}</h3>
                {plan.notes && <p className="muted small mt-xs">{plan.notes}</p>}
              </div>
              {plan.days.map((d, i) => (
                <div key={i} className="dd-block">
                  <h4>{d.name}</h4>
                  <ul className="plain small">
                    {d.exercises.map((x, j) => {
                      const ex = map.get(x.id);
                      return <li key={j} className="row between"><span>{ex ? exName(ex, lang) : x.id}</span><span className="muted nowrap">{x.sets} × {x.reps} · {x.rest} s</span></li>;
                    })}
                  </ul>
                </div>
              ))}
              <p className="ai-meta">{t('ai.generated_by', { model })} · {t('aiplan.review')}</p>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}
