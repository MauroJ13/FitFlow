import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ClipboardList, Copy, Dumbbell, FileUp, History, Play, Plus, Sparkles, Trash2 } from 'lucide-react';
import { AiPlanSheet } from '../components/AiPlan';
import type { Exercise, WorkoutSession } from '../types';
import { useT } from '../i18n';
import { save, useTable } from '../lib/db';
import { fmtDuration } from '../lib/date';
import { useExercises } from '../lib/hooks';
import { deletePlan, deleteSession, duplicatePlan, startFreeSession, startSession } from '../lib/workout';
import { ExerciseDetail, ExerciseForm, ExerciseList } from '../components/Exercises';
import { Btn, Card, Empty, IconBtn, PageHead, Seg, Sheet, confirmDialog, toast } from '../components/ui';

export default function Gym() {
  const { t, lang, date: fmt, num } = useT();
  const nav = useNavigate();
  const plans = useTable('workout_plans');
  const days = useTable('workout_days');
  const wes = useTable('workout_exercises');
  const sessions = useTable('workout_sessions');
  const sets = useTable('completed_sets');
  const { map: exMap } = useExercises();
  const [tab, setTab] = useState<'plans' | 'library' | 'history'>('plans');
  const [detail, setDetail] = useState<Exercise | null>(null);
  const [creating, setCreating] = useState(false);
  const [viewing, setViewing] = useState<WorkoutSession | null>(null);
  const [aiPlan, setAiPlan] = useState(false);

  const active = sessions.find((s) => s.status === 'active');
  const done = sessions.filter((s) => s.status === 'done').sort((a, b) => (b.finished_at ?? b.date).localeCompare(a.finished_at ?? a.date));
  const newPlan = () => {
    const p = save('workout_plans', { name: t('gym.new_plan_name'), notes: '' });
    save('workout_days', { plan_id: p.id, name: `${t('gym.day')} 1`, position: 0, weekdays: [] });
    nav(`/gym/plan/${p.id}`);
  };
  const sessionMinutes = (s: WorkoutSession) => (s.finished_at ? Math.max(1, Math.round((Date.parse(s.finished_at) - Date.parse(s.started_at)) / 60000)) : 0);
  const viewSets = viewing ? sets.filter((x) => x.session_id === viewing.id).sort((a, b) => a.item_index - b.item_index || a.set_number - b.set_number) : [];

  return (
    <div className="page">
      <PageHead title={t('nav.gym')} />
      {active && (
        <Card className="accent">
          <div className="row between">
            <div><b>{active.name}</b><p className="muted small">{t('home.in_progress')}</p></div>
            <Btn variant="primary" onClick={() => nav(`/gym/session/${active.id}`)}><Play size={18} />{t('home.resume')}</Btn>
          </div>
        </Card>
      )}
      <Seg value={tab} onChange={setTab} options={[
        { v: 'plans', l: <><ClipboardList size={16} />{t('gym.plans')}</> },
        { v: 'library', l: <><Dumbbell size={16} />{t('gym.library')}</> },
        { v: 'history', l: <><History size={16} />{t('gym.history')}</> },
      ]} />

      {tab === 'plans' && (
        <div className="stack">
          <div className="row wrap">
            <Btn variant="primary" onClick={newPlan}><Plus size={18} />{t('gym.new_plan')}</Btn>
            <Btn onClick={() => setAiPlan(true)}><Sparkles size={18} />{t('aiplan.button')}</Btn>
            <Link className="btn soft" to="/gym/import"><FileUp size={18} />{t('gym.import')}</Link>
            {!active && <Btn onClick={() => nav(`/gym/session/${startFreeSession(t('gym.free_session')).id}`)}><Play size={18} />{t('gym.free_session')}</Btn>}
          </div>
          {!plans.length && <Empty icon={<ClipboardList size={32} />} title={t('gym.no_plans')} text={t('gym.no_plans_hint')} />}
          <div className="card-grid">
            {plans.map((p) => {
              const pd = days.filter((d) => d.plan_id === p.id).sort((a, b) => a.position - b.position);
              return (
                <Card key={p.id} title={p.name} action={<div className="row">
                  <IconBtn label={t('c.duplicate')} onClick={() => { duplicatePlan(p, t('c.copy_suffix')); toast(t('gym.plan_duplicated')); }}><Copy size={17} /></IconBtn>
                  <IconBtn label={t('c.delete')} onClick={async () => { if (await confirmDialog(t('gym.delete_plan_q', { name: p.name }))) deletePlan(p.id); }}><Trash2 size={17} /></IconBtn>
                </div>}>
                  {p.notes && <p className="muted small">{p.notes}</p>}
                  <ul className="list">
                    {pd.map((d) => {
                      const n = wes.filter((w) => w.day_id === d.id).length;
                      return (
                        <li key={d.id} className="item">
                          <div className="item-main static">
                            <span className="item-title">{d.name}</span>
                            <span className="muted small">{t('gym.n_exercises', { n })}{d.weekdays?.length ? ` · ${d.weekdays.map((w) => t(`wd.${w}`)).join(', ')}` : ''}</span>
                          </div>
                          <Btn variant="primary" small disabled={!n || !!active} onClick={() => nav(`/gym/session/${startSession(p, d, exMap, lang).id}`)}><Play size={16} />{t('gym.start')}</Btn>
                        </li>
                      );
                    })}
                  </ul>
                  <Link className="btn soft block mt" to={`/gym/plan/${p.id}`}>{t('gym.edit_plan')}</Link>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'library' && (
        <div className="stack">
          <Btn onClick={() => setCreating(true)}><Plus size={18} />{t('ex.create')}</Btn>
          <ExerciseList onPick={setDetail} />
        </div>
      )}

      {tab === 'history' && (
        <div className="stack">
          {!done.length && <Empty icon={<History size={32} />} title={t('gym.no_history')} text={t('gym.no_history_hint')} />}
          <ul className="list">
            {done.map((s) => {
              const n = sets.filter((x) => x.session_id === s.id).length;
              return (
                <li key={s.id} className="item">
                  <button type="button" className="item-main" onClick={() => setViewing(s)}>
                    <span className="item-title">{s.name}</span>
                    <span className="muted small">{fmt(s.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · {t('gym.n_sets', { n })}{sessionMinutes(s) ? ` · ${fmtDuration(sessionMinutes(s))}` : ''}</span>
                  </button>
                  <IconBtn label={t('c.delete')} onClick={async () => { if (await confirmDialog(t('gym.delete_session_q'))) deleteSession(s.id); }}><Trash2 size={16} /></IconBtn>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <AiPlanSheet open={aiPlan} onClose={() => setAiPlan(false)} />
      <ExerciseDetail exercise={detail} onClose={() => setDetail(null)} onOpen={setDetail} />
      <Sheet open={creating} onClose={() => setCreating(false)} title={t('ex.create')}>
        <ExerciseForm onDone={() => { setCreating(false); toast(t('c.saved')); }} />
      </Sheet>
      <Sheet open={!!viewing} onClose={() => setViewing(null)} title={viewing?.name ?? ''}>
        {viewing && (
          <div className="stack">
            <p className="muted">{fmt(viewing.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
            {!viewSets.length && <p className="muted">{t('cal.no_sets')}</p>}
            <ul className="plain">
              {[...new Set(viewSets.map((x) => x.item_index))].map((idx) => {
                const group = viewSets.filter((x) => x.item_index === idx);
                const ex = exMap.get(group[0].exercise_id);
                return <li key={idx}><b>{ex ? (ex.names?.[lang] ?? ex.name) : group[0].exercise_name}</b>: <span className="muted">{group.map((g) => `${g.reps}${g.weight ? ` × ${num(g.weight, 1)} kg` : ''}`).join(' · ')}</span></li>;
              })}
            </ul>
            {viewing.notes && <p className="hint-box">{viewing.notes}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
