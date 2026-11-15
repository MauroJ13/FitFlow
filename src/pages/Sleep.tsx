import { useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Moon, Pencil, Plus, Trash2 } from 'lucide-react';
import type { RecoveryLog, SleepRecord } from '../types';
import { useT } from '../i18n';
import { remove, save, useTable } from '../lib/db';
import { addDays, axisToClock, bedAxis, fmtDuration, rangeDays, sleepMinutes, today } from '../lib/date';
import { savePrefs, usePrefs, useProfile } from '../lib/hooks';
import { periodStats, useData } from '../lib/stats';
import { buildInsights } from '../lib/insights';
import { AiCard } from '../components/AiCard';
import { Bars, Lines } from '../components/charts';
import { Btn, Card, Empty, Field, IconBtn, NumInput, PageHead, Seg, Sheet, TextInput, Toggle, confirmDialog, toast } from '../components/ui';

export default function Sleep() {
  const { t, date: fmt, num } = useT();
  const loc = useLocation();
  const records = useTable('sleep_records');
  const data = useData();
  const prefs = usePrefs();
  const profile = useProfile();
  const [range, setRange] = useState<'7' | '30'>('7');
  const [form, setForm] = useState<Partial<SleepRecord> | null>(null);
  const [err, setErr] = useState('');

  const end = today();
  const from = addDays(end, -(Number(range) - 1));
  const stats = useMemo(() => periodStats(data, from, end), [data, from, end]);
  const chart = rangeDays(from, end).map((k) => {
    const r = data.day(k).sleep;
    return { label: fmt(k, range === '7' ? { weekday: 'short' } : { day: 'numeric', month: 'numeric' }), hours: r ? Math.round(r.duration_min / 6) / 10 : null, bed: r ? bedAxis(r.bedtime) : null };
  });
  const sorted = [...records].sort((a, b) => b.date.localeCompare(a.date));
  const open = (r?: SleepRecord) => {
    setErr('');
    setForm(r ?? {
      date: (loc.state as { date?: string } | null)?.date ?? end,
      bedtime: profile?.sleep_bedtime || '23:00', wake_time: profile?.sleep_waketime || '07:00', energy: null, quality: null, notes: '',
    });
  };
  const submit = () => {
    if (!form?.date || !form.bedtime || !form.wake_time) return setErr(t('sleep.v.times'));
    if (form.date > end) return setErr(t('v.future'));
    const duration = sleepMinutes(form.bedtime, form.wake_time);
    if (duration > 18 * 60) return setErr(t('sleep.v.long'));
    const clash = records.find((r) => r.date === form.date && r.id !== form.id);
    save('sleep_records', { ...(form.id ? { id: form.id } : clash ? { id: clash.id } : {}), date: form.date, bedtime: form.bedtime, wake_time: form.wake_time, duration_min: duration, energy: form.energy ?? null, quality: form.quality ?? null, notes: (form.notes ?? '').trim() });
    setForm(null);
    toast(t('c.saved'));
  };
  const recovery = data.day(end).recovery;
  const setRecovery = (patch: Partial<RecoveryLog>) => save('recovery_logs', { ...(recovery ? { id: recovery.id } : { date: end, rest_day: false, soreness: null, stress: null, notes: '' }), ...patch });
  const observations = buildInsights(periodStats(data, addDays(end, -6), end), periodStats(data, addDays(end, -13), addDays(end, -7)), prefs)
    .filter((i) => /sleep|recover|energy|rest|combo/.test(i.key));
  const preview = form?.bedtime && form.wake_time ? sleepMinutes(form.bedtime, form.wake_time) : null;

  return (
    <div className="page">
      <PageHead title={t('nav.sleep')} sub={t('sleep.sub')}>
        <Btn variant="primary" onClick={() => open()}><Plus size={18} />{t('sleep.add')}</Btn>
      </PageHead>

      <Seg value={range} onChange={setRange} options={[{ v: '7', l: t('c.week') }, { v: '30', l: t('c.month') }]} />
      <div className="kpis">
        <div className="kpi"><span className="muted small">{t('sleep.avg')}</span><b>{stats.avgSleepMin == null ? '–' : fmtDuration(stats.avgSleepMin)}</b></div>
        <div className="kpi"><span className="muted small">{t('sleep.nights')}</span><b>{stats.sleepNights}/{stats.days}</b></div>
        <div className="kpi"><span className="muted small">{t('sleep.consistency')}</span><b>{stats.bedtimeSd == null ? '–' : `± ${Math.round(stats.bedtimeSd)} min`}</b></div>
        <div className="kpi"><span className="muted small">{t('sleep.energy')}</span><b>{stats.avgEnergy == null ? '–' : `${num(stats.avgEnergy, 1)}/5`}</b></div>
        <div className="kpi"><span className="muted small">{t('sleep.quality')}</span><b>{stats.avgQuality == null ? '–' : `${num(stats.avgQuality, 1)}/5`}</b></div>
      </div>
      <p className="muted small">{t('sleep.consistency_hint')}</p>

      {!records.length ? (
        <Empty icon={<Moon size={32} />} title={t('sleep.none')} text={t('sleep.none_hint')} />
      ) : (
        <div className="chart-grid">
          <Card title={t('sleep.duration_chart')}><Bars data={chart} y="hours" name={t('sleep.duration')} unit="h" color="var(--c-sleep)" /></Card>
          <Card title={t('sleep.bedtime_chart')}>
            <Lines data={chart} series={[{ key: 'bed', name: t('sleep.bedtime'), color: 'var(--c-sleep)' }]} fmt={axisToClock} domain={['dataMin - 30', 'dataMax + 30']} />
          </Card>
        </div>
      )}

      <Card title={t('rec2.title')}>
        <p className="muted small">{t('rec2.hint')}</p>
        <Toggle label={t('rec2.rest_day')} checked={!!recovery?.rest_day} onChange={(rest_day) => setRecovery({ rest_day })} />
        {(['soreness', 'stress'] as const).map((k) => (
          <Field group key={k} label={t(`rec2.${k}`)}>
            <div className="seg">
              {[1, 2, 3, 4, 5].map((n) => (
                <button key={n} type="button" aria-pressed={recovery?.[k] === n} className={recovery?.[k] === n ? 'on' : ''} onClick={() => setRecovery({ [k]: recovery?.[k] === n ? null : n })}>{n}</button>
              ))}
            </div>
          </Field>
        ))}
        <span className="field-hint">{t('rec2.scale')}</span>
        <ul className="insights mt">{observations.map((i, n) => <li key={n} className={i.kind}>{t(i.key, i.vars)}</li>)}</ul>
        <p className="muted small">{t('rec2.rest_days_n', { n: stats.restDays })}</p>
      </Card>

      <AiCard task="sleep" title={t('ai.sleep_title')} cacheKey="sleep" actionLabel={t('ai.analyse')} />

      <Card title={t('sleep.pref')}>
        <div className="row between">
          <p className="muted small grow">{t('sleep.pref_hint')}</p>
          <div className="narrow"><NumInput value={prefs.sleep_pref_h} max={14} placeholder="–" aria-label={t('sleep.pref')} onChange={(v) => savePrefs({ sleep_pref_h: v && v > 0 ? v : null })} /></div>
          <span className="muted">h</span>
        </div>
      </Card>

      {sorted.length > 0 && (
        <Card title={t('sleep.history')}>
          <ul className="list">
            {sorted.slice(0, 60).map((r) => (
              <li key={r.id} className="item">
                <div className="item-main static">
                  <span className="item-title">{fmt(r.date, { weekday: 'short', day: 'numeric', month: 'short' })} · {fmtDuration(r.duration_min)}</span>
                  <span className="muted small">{r.bedtime} – {r.wake_time}{r.energy ? ` · ${t('sleep.energy')} ${r.energy}/5` : ''}{r.quality ? ` · ${t('sleep.quality')} ${r.quality}/5` : ''}{r.notes ? ` · ${r.notes}` : ''}</span>
                </div>
                <IconBtn label={t('c.edit')} onClick={() => open(r)}><Pencil size={16} /></IconBtn>
                <IconBtn label={t('c.delete')} onClick={async () => { if (await confirmDialog(t('sleep.delete_q'))) remove('sleep_records', r.id); }}><Trash2 size={16} /></IconBtn>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <p className="muted small">{t('sleep.disclaimer')}</p>

      <Sheet open={!!form} onClose={() => setForm(null)} title={form?.id ? t('sleep.edit') : t('sleep.add')}
        footer={<Btn variant="primary" block onClick={submit}>{t('c.save')}</Btn>}>
        {form && (
          <div className="stack">
            <Field label={t('sleep.wake_date')} hint={t('sleep.wake_date_hint')}><TextInput type="date" max={end} value={form.date ?? ''} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <div className="grid2">
              <Field label={t('sleep.bedtime')}><TextInput type="time" value={form.bedtime ?? ''} onChange={(e) => setForm({ ...form, bedtime: e.target.value })} /></Field>
              <Field label={t('sleep.wake')}><TextInput type="time" value={form.wake_time ?? ''} onChange={(e) => setForm({ ...form, wake_time: e.target.value })} /></Field>
            </div>
            {preview != null && <div className="preview"><b>{fmtDuration(preview)}</b> <span className="muted">{t('sleep.calculated')}</span></div>}
            <Field group label={t('sleep.energy_q')}>
              <div className="seg">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-pressed={form.energy === n} className={form.energy === n ? 'on' : ''} onClick={() => setForm({ ...form, energy: form.energy === n ? null : n })}>{n}</button>
                ))}
              </div>
              <span className="field-hint">{t('sleep.energy_scale')}</span>
            </Field>
            <Field group label={t('sleep.quality_q')}>
              <div className="seg">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-pressed={form.quality === n} className={form.quality === n ? 'on' : ''} onClick={() => setForm({ ...form, quality: form.quality === n ? null : n })}>{n}</button>
                ))}
              </div>
              <span className="field-hint">{t('sleep.quality_scale')}</span>
            </Field>
            <Field label={t('c.notes')}><textarea className="input" rows={2} value={form.notes ?? ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            {err && <p className="field-error">{err}</p>}
          </div>
        )}
      </Sheet>
    </div>
  );
}
