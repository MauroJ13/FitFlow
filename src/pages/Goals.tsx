import { useState } from 'react';
import { Check, Minus, Pencil, Plus, RotateCcw, Target, Trash2 } from 'lucide-react';
import type { Goal } from '../types';
import { useT } from '../i18n';
import { GOAL_CATEGORIES } from '../data';
import { getTable, nowIso, remove, save, useTable } from '../lib/db';
import { today } from '../lib/date';
import { Btn, Card, Empty, Field, IconBtn, NumInput, PageHead, Seg, Sheet, TextInput, confirmDialog, cx, toast } from '../components/ui';

/** Personal goals: behaviour-focused, with optional numeric target and milestones. */
export default function Goals() {
  const { t, date: fmt, num } = useT();
  const goals = useTable('goals');
  const milestones = useTable('goal_milestones');
  const [tab, setTab] = useState<'active' | 'done'>('active');
  const [form, setForm] = useState<Partial<Goal> | null>(null);
  const [err, setErr] = useState('');
  const [newMs, setNewMs] = useState<Record<string, string>>({});

  const list = goals.filter((g) => g.status === tab).sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  const msOf = (id: string) => milestones.filter((m) => m.goal_id === id).sort((a, b) => a.position - b.position);
  const progress = (g: Goal) => {
    const ms = msOf(g.id);
    if (g.target && g.target > 0) return Math.min(1, g.current / g.target);
    return ms.length ? ms.filter((m) => m.done).length / ms.length : g.status === 'done' ? 1 : 0;
  };
  const submit = () => {
    const title = (form?.title ?? '').trim();
    if (!title) return setErr(t('v.name'));
    if (form?.due && form.due < today() && !form.id) return setErr(t('goals.v.due'));
    save('goals', {
      ...(form?.id ? { id: form.id } : { current: 0, status: 'active', completed_at: null }),
      title, category: form?.category ?? 'training', target: form?.target && form.target > 0 ? form.target : null,
      unit: (form?.unit ?? '').trim(), due: form?.due || null, notes: (form?.notes ?? '').trim(),
    });
    setForm(null);
    toast(t('c.saved'));
  };
  const step = (g: Goal, delta: number) => save('goals', { id: g.id, current: Math.max(0, Math.round((g.current + delta) * 100) / 100) });
  const setDone = (g: Goal, done: boolean) => {
    save('goals', { id: g.id, status: done ? 'done' : 'active', completed_at: done ? nowIso() : null });
    if (done) toast(t('goals.completed_toast'));
  };
  const del = async (g: Goal) => {
    if (!(await confirmDialog(t('goals.delete_q', { name: g.title })))) return;
    getTable('goal_milestones').filter((m) => m.goal_id === g.id).forEach((m) => remove('goal_milestones', m.id));
    remove('goals', g.id);
  };
  const addMs = (g: Goal) => {
    const title = (newMs[g.id] ?? '').trim();
    if (!title) return;
    save('goal_milestones', { goal_id: g.id, title, done: false, position: msOf(g.id).length });
    setNewMs({ ...newMs, [g.id]: '' });
  };

  return (
    <div className="page">
      <PageHead title={t('nav.goals')} sub={t('goals.sub')}>
        <Btn variant="primary" onClick={() => { setErr(''); setForm({ category: 'training' }); }}><Plus size={18} />{t('goals.add')}</Btn>
      </PageHead>
      <Seg value={tab} onChange={setTab} options={[{ v: 'active', l: t('goals.active') }, { v: 'done', l: t('goals.done') }]} />
      {!list.length && <Empty icon={<Target size={32} />} title={tab === 'active' ? t('goals.none') : t('goals.none_done')} text={t('goals.none_hint')} />}
      <div className="card-grid">
        {list.map((g) => {
          const p = progress(g);
          const ms = msOf(g.id);
          return (
            <Card key={g.id} title={g.title} action={<div className="row">
              <IconBtn label={t('c.edit')} onClick={() => { setErr(''); setForm(g); }}><Pencil size={16} /></IconBtn>
              <IconBtn label={t('c.delete')} onClick={() => del(g)}><Trash2 size={16} /></IconBtn>
            </div>}>
              <p className="muted small">{t(`gcat.${g.category}`)}{g.due ? ` · ${t('goals.due')} ${fmt(g.due, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{g.completed_at ? ` · ${t('goals.done_on')} ${fmt(g.completed_at.slice(0, 10), { day: 'numeric', month: 'short' })}` : ''}</p>
              <div className="bar big" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}><i style={{ width: `${p * 100}%` }} /></div>
              {g.target ? (
                <div className="row between mt">
                  <b>{num(g.current, 2)} / {num(g.target, 2)} {g.unit}</b>
                  {g.status === 'active' && (
                    <div className="row">
                      <IconBtn label="−1" onClick={() => step(g, -1)}><Minus size={18} /></IconBtn>
                      <IconBtn label="+1" className="on" onClick={() => step(g, 1)}><Plus size={18} /></IconBtn>
                    </div>
                  )}
                </div>
              ) : <p className="muted small mt">{Math.round(p * 100)} %</p>}
              {g.notes && <p className="muted small">{g.notes}</p>}
              <ul className="list">
                {ms.map((m) => (
                  <li key={m.id} className="item">
                    <button type="button" aria-pressed={m.done} className={cx('habit', m.done && 'on')} onClick={() => save('goal_milestones', { id: m.id, done: !m.done })}>
                      <span className="check">{m.done && <Check size={14} />}</span>{m.title}
                    </button>
                    <IconBtn label={t('c.delete')} onClick={() => remove('goal_milestones', m.id)}><Trash2 size={15} /></IconBtn>
                  </li>
                ))}
              </ul>
              {g.status === 'active' && (
                <div className="row mt">
                  <input className="input grow" value={newMs[g.id] ?? ''} placeholder={t('goals.milestone_ph')} aria-label={t('goals.milestone_ph')}
                    onChange={(e) => setNewMs({ ...newMs, [g.id]: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') addMs(g); }} />
                  <Btn onClick={() => addMs(g)} aria-label={t('c.add')}><Plus size={18} /></Btn>
                </div>
              )}
              <div className="mt">
                {g.status === 'active'
                  ? <Btn variant={p >= 1 ? 'primary' : 'soft'} block onClick={() => setDone(g, true)}><Check size={18} />{t('goals.complete')}</Btn>
                  : <Btn block onClick={() => setDone(g, false)}><RotateCcw size={18} />{t('goals.reopen')}</Btn>}
              </div>
            </Card>
          );
        })}
      </div>
      <p className="muted small">{t('goals.note')}</p>

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? t('goals.edit') : t('goals.add')} footer={<Btn variant="primary" block onClick={submit}>{t('c.save')}</Btn>}>
        {form && (
          <div className="stack">
            <Field label={t('goals.title')} error={err || null}><TextInput value={form.title ?? ''} placeholder={t('goals.title_ph')} autoFocus onChange={(e) => { setErr(''); setForm({ ...form, title: e.target.value }); }} /></Field>
            <Field label={t('ex.category')}>
              <select className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>{GOAL_CATEGORIES.map((c) => <option key={c} value={c}>{t(`gcat.${c}`)}</option>)}</select>
            </Field>
            <div className="grid2">
              <Field label={t('goals.target')} hint={t('food.optional')}><NumInput value={form.target ?? null} placeholder="–" onChange={(v) => setForm({ ...form, target: v })} /></Field>
              <Field label={t('c.unit')} hint={t('goals.unit_hint')}><TextInput value={form.unit ?? ''} onChange={(e) => setForm({ ...form, unit: e.target.value.slice(0, 20) })} /></Field>
            </div>
            <Field label={t('goals.due')} hint={t('food.optional')}><TextInput type="date" value={form.due ?? ''} onChange={(e) => setForm({ ...form, due: e.target.value })} /></Field>
            <Field label={t('c.notes')}><textarea className="input" rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          </div>
        )}
      </Sheet>
    </div>
  );
}
