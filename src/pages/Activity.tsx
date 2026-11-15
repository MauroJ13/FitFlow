import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Footprints, Pencil, Plus, Trash2 } from 'lucide-react';
import type { ActivityRecord } from '../types';
import { useT } from '../i18n';
import { ACTIVITY_TYPES } from '../data';
import { remove, save, useTable } from '../lib/db';
import { addDays, today } from '../lib/date';
import { Btn, Card, Empty, Field, IconBtn, NumInput, PageHead, Sheet, TextInput, confirmDialog, toast } from '../components/ui';

export default function Activity() {
  const { t, date: fmt, num } = useT();
  const loc = useLocation();
  const records = useTable('activity_records');
  const [form, setForm] = useState<Partial<ActivityRecord> | null>(null);
  const [err, setErr] = useState('');

  const end = today();
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  const week = records.filter((r) => r.date > addDays(end, -7));
  const open = (r?: ActivityRecord) => {
    setErr('');
    setForm(r ?? { date: (loc.state as { date?: string } | null)?.date ?? end, type: 'walk', duration_min: 30, distance_km: null, steps: null, notes: '' });
  };
  const submit = () => {
    if (!form?.date || form.date > end) return setErr(t('v.future'));
    if (!form.duration_min || form.duration_min <= 0 || form.duration_min > 1440) return setErr(t('act.v.duration'));
    save('activity_records', {
      ...(form.id ? { id: form.id } : {}), date: form.date, type: form.type ?? 'other', duration_min: Math.round(form.duration_min),
      distance_km: form.distance_km && form.distance_km > 0 ? form.distance_km : null, steps: form.steps && form.steps > 0 ? Math.round(form.steps) : null, notes: (form.notes ?? '').trim(),
    });
    setForm(null);
    toast(t('c.saved'));
  };

  return (
    <div className="page">
      <PageHead title={t('nav.activity')} sub={t('act.sub')}>
        <Btn variant="primary" onClick={() => open()}><Plus size={18} />{t('act.add')}</Btn>
      </PageHead>
      <div className="kpis">
        <div className="kpi"><span className="muted small">{t('act.week_count')}</span><b>{week.length}</b></div>
        <div className="kpi"><span className="muted small">{t('act.week_min')}</span><b>{num(week.reduce((s, r) => s + r.duration_min, 0))} min</b></div>
        <div className="kpi"><span className="muted small">{t('act.week_km')}</span><b>{week.some((r) => r.distance_km) ? `${num(week.reduce((s, r) => s + (r.distance_km ?? 0), 0), 1)} km` : '–'}</b></div>
      </div>

      {!records.length && <Empty icon={<Footprints size={32} />} title={t('act.none')} text={t('act.none_hint')} />}
      {sorted.length > 0 && (
        <Card title={t('act.history')}>
          <ul className="list">
            {sorted.slice(0, 100).map((r) => (
              <li key={r.id} className="item">
                <div className="item-main static">
                  <span className="item-title">{t(`act.${r.type}`)} · {r.duration_min} min</span>
                  <span className="muted small">
                    {fmt(r.date, { weekday: 'short', day: 'numeric', month: 'short' })}{r.distance_km ? ` · ${num(r.distance_km, 2)} km` : ''}{r.steps ? ` · ${num(r.steps)} ${t('act.steps')}` : ''}{r.notes ? ` · ${r.notes}` : ''}
                  </span>
                </div>
                <IconBtn label={t('c.edit')} onClick={() => open(r)}><Pencil size={16} /></IconBtn>
                <IconBtn label={t('c.delete')} onClick={async () => { if (await confirmDialog(t('act.delete_q'))) remove('activity_records', r.id); }}><Trash2 size={16} /></IconBtn>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="muted small">{t('act.honesty')}</p>
      <p className="muted small">{t('act.health_note')}</p>

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? t('act.edit') : t('act.add')}
        footer={<Btn variant="primary" block onClick={submit}>{t('c.save')}</Btn>}>
        {form && (
          <div className="stack">
            <div className="grid2">
              <Field label={t('act.type')}>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                  {ACTIVITY_TYPES.map((a) => <option key={a} value={a}>{t(`act.${a}`)}</option>)}
                </select>
              </Field>
              <Field label={t('c.date')}><TextInput type="date" max={end} value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            </div>
            <Field label={t('act.duration')}><NumInput value={form.duration_min ?? null} max={1440} onChange={(v) => setForm({ ...form, duration_min: v ?? 0 })} /></Field>
            <div className="grid2">
              <Field label={t('act.distance')} hint={t('food.optional')}><NumInput value={form.distance_km ?? null} max={1000} placeholder="–" onChange={(v) => setForm({ ...form, distance_km: v })} /></Field>
              <Field label={t('act.steps_label')} hint={t('act.steps_hint')}><NumInput value={form.steps ?? null} max={200000} placeholder="–" onChange={(v) => setForm({ ...form, steps: v })} /></Field>
            </div>
            <Field label={t('c.notes')}><textarea className="input" rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            {err && <p className="field-error">{err}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
