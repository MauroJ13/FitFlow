import { useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { useT } from '../i18n';
import { addDays, diffDays, fmtDuration, rangeDays, today, weekStart } from '../lib/date';
import { exName, useExercises } from '../lib/hooks';
import { periodStats, personalRecords, useData, type PeriodStats } from '../lib/stats';
import { Bars, Lines } from '../components/charts';
import { Card, Empty, Field, PageHead, Seg, TextInput } from '../components/ui';
import { AiCard } from '../components/AiCard';
import { progressFigures } from '../lib/ai';

type Range = 'week' | 'month' | 'custom';

export default function Progress() {
  const { t, date: fmt, num, lang } = useT();
  const data = useData();
  const { map: exMap } = useExercises();
  const end0 = today();
  const [range, setRange] = useState<Range>('month');
  const [cFrom, setCFrom] = useState(addDays(end0, -89));
  const [cTo, setCTo] = useState(end0);
  const [exId, setExId] = useState('');

  const to = range === 'custom' ? (cTo > end0 ? end0 : cTo) : end0;
  const from = range === 'week' ? addDays(to, -6) : range === 'month' ? addDays(to, -29) : (cFrom > to ? to : cFrom);
  const len = diffDays(from, to) + 1;
  const prevTo = addDays(from, -1);
  const prevFrom = addDays(prevTo, -(len - 1));

  const cur = useMemo(() => periodStats(data, from, to), [data, from, to]);
  const prev = useMemo(() => periodStats(data, prevFrom, prevTo), [data, prevFrom, prevTo]);

  /** Daily buckets for short ranges, weekly buckets (Monday start) for long ones. */
  const buckets = useMemo(() => {
    const days = rangeDays(from, to);
    const daily = days.length <= 45;
    const groups = new Map<string, string[]>();
    days.forEach((k) => { const key = daily ? k : weekStart(k); groups.set(key, [...(groups.get(key) ?? []), k]); });
    return [...groups].map(([key, ks]) => {
      const s = periodStats(data, ks[0], ks[ks.length - 1]);
      return {
        label: fmt(key, { day: 'numeric', month: 'numeric' }),
        workouts: s.workouts, activityMin: s.activityMin, habits: s.habitChecks,
        sleepH: s.avgSleepMin == null ? null : Math.round(s.avgSleepMin / 6) / 10,
        water: s.avgWaterMl == null ? null : Math.round(s.avgWaterMl),
        kcal: s.avgKcal == null ? null : Math.round(s.avgKcal),
        protein: s.avgProtein == null ? null : Math.round(s.avgProtein),
        volume: Math.round(s.volume),
      };
    });
  }, [data, from, to, fmt]);
  const weekly = len > 45;

  // exercise performance: best weight and volume per session
  const exercisesWithSets = useMemo(() => {
    const ids = new Map<string, string>();
    data.sets.forEach((s) => { const ex = exMap.get(s.exercise_id); ids.set(s.exercise_id, ex ? exName(ex, lang) : s.exercise_name); });
    return [...ids].sort((a, b) => a[1].localeCompare(b[1]));
  }, [data.sets, exMap, lang]);
  const selectedEx = exId || exercisesWithSets[0]?.[0] || '';
  const perf = useMemo(() => {
    const bySession = new Map<string, { date: string; top: number; reps: number; volume: number }>();
    data.sets.filter((s) => s.exercise_id === selectedEx && s.date >= from && s.date <= to).forEach((s) => {
      const p = bySession.get(s.session_id) ?? { date: s.date, top: 0, reps: 0, volume: 0 };
      p.top = Math.max(p.top, s.weight ?? 0); p.reps += s.reps; p.volume += (s.weight ?? 0) * s.reps;
      bySession.set(s.session_id, p);
    });
    return [...bySession.values()].sort((a, b) => a.date.localeCompare(b.date))
      .map((p) => ({ label: fmt(p.date, { day: 'numeric', month: 'numeric' }), top: p.top || null, reps: p.reps, volume: Math.round(p.volume) || null }));
  }, [data.sets, selectedEx, from, to, fmt]);

  const records = useMemo(() => personalRecords(data.sets), [data.sets]);
  const figures = useMemo(() => progressFigures(from, to, prevFrom, prevTo), [data, from, to, prevFrom, prevTo]); // eslint-disable-line react-hooks/exhaustive-deps
  const kpi = (label: string, value: string, prevValue: string) => (
    <div className="kpi"><span className="muted small">{label}</span><b>{value}</b><span className="muted small">{t('prog.prev')}: {prevValue}</span></div>
  );
  const dur = (s: PeriodStats) => (s.avgSleepMin == null ? '–' : fmtDuration(s.avgSleepMin));
  const nothing = !cur.workouts && !cur.nutritionDays && !cur.sleepNights && !cur.waterDays && !cur.activityCount && !cur.habitChecks;
  const suffix = weekly ? ` (${t('prog.per_week')})` : '';

  return (
    <div className="page">
      <PageHead title={t('nav.progress')} sub={`${fmt(from, { day: 'numeric', month: 'short', year: 'numeric' })} – ${fmt(to, { day: 'numeric', month: 'short', year: 'numeric' })}`} />
      <Seg value={range} onChange={setRange} options={[{ v: 'week', l: t('c.week') }, { v: 'month', l: t('c.month') }, { v: 'custom', l: t('prog.custom') }]} />
      {range === 'custom' && (
        <div className="grid2">
          <Field label={t('prog.from')}><TextInput type="date" value={cFrom} max={cTo} onChange={(e) => e.target.value && setCFrom(e.target.value)} /></Field>
          <Field label={t('prog.to')}><TextInput type="date" value={cTo} max={end0} min={cFrom} onChange={(e) => e.target.value && setCTo(e.target.value)} /></Field>
        </div>
      )}

      <div className="kpis">
        {kpi(t('prog.workouts'), String(cur.workouts), String(prev.workouts))}
        {kpi(t('prog.sets'), String(cur.sets), String(prev.sets))}
        {kpi(t('prog.sleep_avg'), dur(cur), dur(prev))}
        {kpi(t('prog.nutrition_days'), `${cur.nutritionDays}/${cur.days}`, `${prev.nutritionDays}/${prev.days}`)}
        {kpi(t('prog.water_avg'), cur.avgWaterMl == null ? '–' : `${num(cur.avgWaterMl)} ml`, prev.avgWaterMl == null ? '–' : `${num(prev.avgWaterMl)} ml`)}
        {kpi(t('prog.activity_min'), `${num(cur.activityMin)} min`, `${num(prev.activityMin)} min`)}
        {kpi(t('prog.habit_checks'), String(cur.habitChecks), String(prev.habitChecks))}
        {kpi(t('prog.active_days'), `${cur.activeDays}/${cur.days}`, `${prev.activeDays}/${prev.days}`)}
      </div>
      <p className="muted small">{t('prog.compare_note', { n: len })}</p>
      {!nothing && <AiCard task="progress" title={t('ai.progress_title')} cacheKey={`progress_${from}_${to}`} extra={{ from, to, ...figures }} actionLabel={t('ai.analyse')} />}

      {nothing ? (
        <Empty icon={<TrendingUp size={32} />} title={t('prog.none')} text={t('prog.none_hint')} />
      ) : (
        <div className="chart-grid">
          <Card title={t('prog.workouts') + suffix}><Bars data={buckets} y="workouts" name={t('prog.workouts')} color="var(--c-gym)" integer /></Card>
          <Card title={t('prog.volume') + suffix}>
            {cur.volume > 0 ? <Bars data={buckets} y="volume" name={t('prog.volume')} unit="kg" /> : <p className="muted">{t('prog.no_weights')}</p>}
          </Card>
          <Card title={t('prog.sleep_chart')}>
            {cur.sleepNights ? <Lines data={buckets} series={[{ key: 'sleepH', name: t('sleep.duration'), color: 'var(--c-sleep)' }]} unit="h" /> : <p className="muted">{t('prog.no_data')}</p>}
          </Card>
          <Card title={t('prog.water_chart')}>
            {cur.waterDays ? <Bars data={buckets} y="water" name={t('nav.hydration')} unit="ml" color="var(--c-water)" /> : <p className="muted">{t('prog.no_data')}</p>}
          </Card>
          <Card title={t('prog.kcal_chart')}>
            {cur.nutritionDays ? (
              <>
                <Bars data={buckets} y="kcal" name={t('n.kcal')} unit="kcal" color="var(--c-nutrition)" />
                <p className="muted small">{t('prog.kcal_note')}</p>
              </>
            ) : <p className="muted">{t('prog.no_data')}</p>}
          </Card>
          <Card title={t('prog.protein_chart')}>
            {cur.nutritionDays ? <Lines data={buckets} series={[{ key: 'protein', name: t('n.protein'), color: 'var(--c-nutrition)' }]} unit="g" /> : <p className="muted">{t('prog.no_data')}</p>}
          </Card>
          <Card title={t('prog.activity_chart') + suffix}>
            {cur.activityCount ? <Bars data={buckets} y="activityMin" name={t('nav.activity')} unit="min" color="var(--c-activity)" /> : <p className="muted">{t('prog.no_data')}</p>}
          </Card>
          <Card title={t('prog.habits_chart') + suffix}>
            {cur.habitChecks ? <Bars data={buckets} y="habits" name={t('nav.habits')} color="var(--c-habits)" integer /> : <p className="muted">{t('prog.no_data')}</p>}
          </Card>
          <Card title={t('prog.exercise')} className="span2">
            {exercisesWithSets.length ? (
              <>
                <select className="input" value={selectedEx} onChange={(e) => setExId(e.target.value)} aria-label={t('prog.exercise')}>
                  {exercisesWithSets.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
                </select>
                {perf.length ? (
                  perf.some((p) => p.top)
                    ? <Lines data={perf} series={[{ key: 'top', name: t('prog.top_weight'), color: 'var(--accent)' }]} unit="kg" />
                    : <Bars data={perf} y="reps" name={t('prog.total_reps')} integer />
                ) : <p className="muted">{t('prog.no_sets_range')}</p>}
              </>
            ) : <p className="muted">{t('prog.no_sets')}</p>}
          </Card>
        </div>
      )}
      <Card title={t('prog.records')}>
        {records.length ? (
          <ul className="list">
            {records.slice(0, 12).map((r) => {
              const ex = exMap.get(r.exercise_id);
              return (
                <li key={r.exercise_id} className="item">
                  <div className="item-main static"><span className="item-title">{ex ? exName(ex, lang) : r.name}</span><span className="muted small">{fmt(r.date, { day: 'numeric', month: 'short', year: 'numeric' })}</span></div>
                  <b>{num(r.weight, 1)} kg × {r.reps}</b>
                </li>
              );
            })}
          </ul>
        ) : <p className="muted">{t('prog.no_records')}</p>}
      </Card>
      <p className="muted small">{t('prog.real_data')}</p>
    </div>
  );
}
