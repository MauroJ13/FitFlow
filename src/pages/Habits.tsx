import { useEffect, useState } from 'react';
import { Award, Check, Lock, Pencil, Plus, Sparkles, Trash2 } from 'lucide-react';
import type { Habit } from '../types';
import { useT } from '../i18n';
import { MESSAGES } from '../data/messages';
import { getTable, remove, save, useTable } from '../lib/db';
import { addDays, fromKey, rangeDays, today, weekStart } from '../lib/date';
import { ACHIEVEMENTS } from '../lib/achievements';
import { useData } from '../lib/stats';
import { Btn, Card, Empty, Field, IconBtn, PageHead, Sheet, TextInput, confirmDialog, cx, toast } from '../components/ui';

export default function Habits() {
  const { t, date: fmt, pick } = useT();
  const data = useData();
  const habits = data.habits.slice().sort((a, b) => a.position - b.position);
  const achievements = useTable('achievements');
  const reflections = useTable('reflections');
  const [form, setForm] = useState<Partial<Habit> | null>(null);
  const [err, setErr] = useState('');

  const d = today();
  const week = rangeDays(weekStart(d), addDays(weekStart(d), 6));
  const thisWeek = weekStart(d);
  const reflection = reflections.find((r) => r.week_start === thisWeek);
  const [text, setText] = useState(reflection?.text ?? '');
  useEffect(() => setText(reflection?.text ?? ''), [reflection?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const unlocked = new Map(achievements.map((a) => [a.key, a]));
  const logged = (habitId: string, date: string) => data.day(date).habitLogs.find((l) => l.habit_id === habitId);
  const toggle = (habitId: string, date: string) => {
    if (date > d) return;
    const log = logged(habitId, date);
    if (log) remove('habit_logs', log.id); else save('habit_logs', { habit_id: habitId, date });
  };
  const submit = () => {
    const name = (form?.name ?? '').trim();
    if (!name) return setErr(t('v.name'));
    if (name.length > 60) return setErr(t('hab.v.long'));
    save('habits', { ...(form?.id ? { id: form.id } : { position: habits.length, archived: false }), name });
    setForm(null);
  };
  const del = async (h: Habit) => {
    if (!(await confirmDialog(t('hab.delete_q', { name: h.name })))) return;
    getTable('habit_logs').filter((l) => l.habit_id === h.id).forEach((l) => remove('habit_logs', l.id));
    remove('habits', h.id);
  };
  const saveReflection = () => {
    if (text.trim() === (reflection?.text ?? '')) return;
    save('reflections', { ...(reflection ? { id: reflection.id } : {}), week_start: thisWeek, text: text.trim() });
    toast(t('c.saved'));
  };
  const dayOfYear = Math.floor((fromKey(d).getTime() - new Date(fromKey(d).getFullYear(), 0, 0).getTime()) / 86_400_000);
  const older = reflections.filter((r) => r.week_start !== thisWeek && r.text).sort((a, b) => b.week_start.localeCompare(a.week_start)).slice(0, 6);

  return (
    <div className="page">
      <PageHead title={t('nav.habits')} sub={t('hab.sub')}>
        <Btn variant="primary" onClick={() => { setErr(''); setForm({ name: '' }); }}><Plus size={18} />{t('hab.add')}</Btn>
      </PageHead>

      <Card className="hero">
        <p className="quote"><Sparkles size={16} /> {pick(MESSAGES[dayOfYear % MESSAGES.length])}</p>
        <p className="muted small">{pick(MESSAGES[(dayOfYear + 5) % MESSAGES.length])}</p>
      </Card>

      <Card title={t('hab.this_week')}>
        {!habits.length && <Empty title={t('hab.none')} text={t('hab.none_hint')} />}
        {habits.length > 0 && (
          <div className="habit-table">
            <div className="ht-row head">
              <span />
              {week.map((k) => <span key={k} className={cx('muted small', k === d && 'today')}>{fmt(k, { weekday: 'narrow' })}</span>)}
              <span />
            </div>
            {habits.map((h) => (
              <div key={h.id} className="ht-row">
                <span className="ht-name">{h.name}</span>
                {week.map((k) => {
                  const on = !!logged(h.id, k);
                  return (
                    <button key={k} type="button" disabled={k > d} aria-pressed={on} aria-label={`${h.name} ${fmt(k)}`} className={cx('ht-cell', on && 'on', k === d && 'today')} onClick={() => toggle(h.id, k)}>
                      {on && <Check size={14} />}
                    </button>
                  );
                })}
                <span className="row">
                  <IconBtn label={t('c.edit')} onClick={() => { setErr(''); setForm(h); }}><Pencil size={15} /></IconBtn>
                  <IconBtn label={t('c.delete')} onClick={() => del(h)}><Trash2 size={15} /></IconBtn>
                </span>
              </div>
            ))}
          </div>
        )}
        <p className="muted small">{t('hab.no_streaks')}</p>
      </Card>

      <Card title={t('hab.reflection')}>
        <p className="muted small">{t('hab.reflection_hint')}</p>
        <textarea className="input" rows={4} value={text} onChange={(e) => setText(e.target.value)} onBlur={saveReflection} placeholder={t('hab.reflection_ph')} />
        <div className="row mt"><Btn onClick={saveReflection}>{t('c.save')}</Btn></div>
        {older.length > 0 && (
          <details className="mt">
            <summary>{t('hab.older')}</summary>
            <ul className="plain">{older.map((r) => <li key={r.id}><b>{fmt(r.week_start, { day: 'numeric', month: 'short', year: 'numeric' })}:</b> {r.text}</li>)}</ul>
          </details>
        )}
      </Card>

      <Card title={t('hab.achievements')}>
        <p className="muted small">{t('hab.achievements_hint')}</p>
        <div className="badge-grid">
          {ACHIEVEMENTS.map((a) => {
            const u = unlocked.get(a.key);
            return (
              <div key={a.key} className={cx('achv', u && 'on')}>
                <span className="achv-icon">{u ? <Award size={22} /> : <Lock size={18} />}</span>
                <b>{t(`ach.${a.key}.t`)}</b>
                <span className="muted small">{t(`ach.${a.key}.d`)}</span>
                {u && <span className="small ok-text">{fmt(u.unlocked_at.slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
              </div>
            );
          })}
        </div>
      </Card>

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? t('hab.edit') : t('hab.add')}
        footer={<Btn variant="primary" block onClick={submit}>{t('c.save')}</Btn>}>
        <Field label={t('c.name')} error={err || null} hint={t('hab.name_hint')}>
          <TextInput value={form?.name ?? ''} autoFocus onChange={(e) => { setErr(''); setForm({ ...form, name: e.target.value }); }} onKeyDown={(e) => { if (e.key === 'Enter') submit(); }} />
        </Field>
      </Sheet>
    </div>
  );
}
