import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, Award, Check, Droplets, Dumbbell, Moon, Play, Plus, SlidersHorizontal, Sparkles, Utensils } from 'lucide-react';
import { AiCard } from '../components/AiCard';
import { useT } from '../i18n';
import { WIDGETS } from '../data';
import { MESSAGES } from '../data/messages';
import { nowTime, rangeDays, today, weekStart, weekdayIndex, addDays, fmtDuration, fromKey } from '../lib/date';
import { remove, save, useTable } from '../lib/db';
import { savePrefs, useExercises, usePrefs, useProfile } from '../lib/hooks';
import { periodStats, useData } from '../lib/stats';
import { buildInsights } from '../lib/insights';
import { startSession } from '../lib/workout';
import { MORE_NAV } from '../components/Layout';
import { NutrientLine } from '../components/Food';
import { Btn, Card, IconBtn, PageHead, Sheet, Toggle, cx } from '../components/ui';

export const DOTS = ['gym', 'nutrition', 'sleep', 'habits', 'water', 'activity'] as const;

export default function Home() {
  const { t, date: fmt, lang, num, pick } = useT();
  const nav = useNavigate();
  const data = useData();
  const prefs = usePrefs();
  const profile = useProfile();
  const { map: exMap } = useExercises();
  const sessions = useTable('workout_sessions');
  const plans = useTable('workout_plans');
  const days = useTable('workout_days');
  const reports = useTable('ai_reports');
  const achievements = useTable('achievements');
  const activeGoals = useTable('goals').filter((g) => g.status === 'active');
  const [custom, setCustom] = useState(false);

  const d = today();
  const day = data.day(d);
  const active = sessions.find((s) => s.status === 'active');
  const todaysDays = days.filter((x) => x.weekdays?.includes(weekdayIndex(d)) && plans.some((p) => p.id === x.plan_id));
  const dayOfYear = Math.floor((fromKey(d).getTime() - new Date(fromKey(d).getFullYear(), 0, 0).getTime()) / 86_400_000);
  const report = [...reports].sort((a, b) => b.period_start.localeCompare(a.period_start))[0];
  const week = rangeDays(weekStart(d), addDays(weekStart(d), 6));
  const insights = buildInsights(periodStats(data, addDays(d, -6), d), periodStats(data, addDays(d, -13), addDays(d, -7)), prefs);
  const hour = new Date().getHours();
  const greeting = t(hour < 11 ? 'home.morning' : hour < 18 ? 'home.day' : 'home.evening');

  const toggleHabit = (habitId: string) => {
    const log = day.habitLogs.find((l) => l.habit_id === habitId);
    if (log) remove('habit_logs', log.id); else save('habit_logs', { habit_id: habitId, date: d });
  };

  const widgets: Record<string, ReactNode> = {
    motivation: (
      <div className="daily-msg" key="motivation"><Sparkles size={16} /><span>{pick(MESSAGES[dayOfYear % MESSAGES.length])}</span></div>
    ),
    today: (
      <section className="today-strip" key="today" aria-label={t('home.today')}>
        <Link to="/gym" className={cx('stat-tile', day.has.gym && 'done')}>
          <span className="stat-icon gym"><Dumbbell size={18} /></span>
          <span className="stat-label">{t('home.training')}</span>
          <b className="stat-value">{active ? t('home.in_progress') : day.has.gym ? t('home.done') : todaysDays.length ? t('home.planned') : t('home.rest')}</b>
        </Link>
        <Link to="/nutrition" className="stat-tile">
          <span className="stat-icon nutrition"><Utensils size={18} /></span>
          <span className="stat-label">{t('home.energy')}</span>
          <b className="stat-value">{day.has.nutrition ? `${day.nutrition.missing.includes('kcal') ? '≥ ' : ''}${num(day.nutrition.kcal)} kcal` : '–'}</b>
        </Link>
        <Link to="/hydration" className="stat-tile">
          <span className="stat-icon water"><Droplets size={18} /></span>
          <span className="stat-label">{t('home.water')}</span>
          <b className="stat-value">{day.waterMl ? `${num(day.waterMl)} ml` : '–'}</b>
        </Link>
        <Link to="/sleep" className="stat-tile">
          <span className="stat-icon sleep"><Moon size={18} /></span>
          <span className="stat-label">{t('home.sleep')}</span>
          <b className="stat-value">{day.sleep ? fmtDuration(day.sleep.duration_min) : '–'}</b>
        </Link>
      </section>
    ),
    ai: <AiCard key="ai" task="focus" title={t('ai.focus_title')} cacheKey="focus" auto />,
    workout: (
      <Card title={t('home.workout')} to="/gym" key="workout">
        {active ? (
          <div className="row between">
            <div><b>{active.name}</b><p className="muted small">{t('home.in_progress')}</p></div>
            <Btn variant="primary" onClick={() => nav(`/gym/session/${active.id}`)}><Play size={18} />{t('home.resume')}</Btn>
          </div>
        ) : day.has.gym ? (
          <p><Check size={16} className="c-gym" /> {t('home.workout_done', { name: day.sessions.map((s) => s.name).join(', ') })}</p>
        ) : todaysDays.length ? (
          <div className="stack tight">
            {todaysDays.map((wd) => {
              const plan = plans.find((p) => p.id === wd.plan_id)!;
              return (
                <div className="row between" key={wd.id}>
                  <div><b>{wd.name}</b><p className="muted small">{plan.name}</p></div>
                  <Btn variant="primary" onClick={() => nav(`/gym/session/${startSession(plan, wd, exMap, lang).id}`)}><Play size={18} />{t('gym.start')}</Btn>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="row between"><p className="muted">{plans.length ? t('home.no_workout_today') : t('home.no_plan')}</p><Link className="btn soft" to="/gym">{t('nav.gym')}</Link></div>
        )}
      </Card>
    ),
    nutrition: (
      <Card title={t('home.nutrition')} to="/nutrition" key="nutrition">
        {day.has.nutrition ? <NutrientLine n={day.nutrition} missing={day.nutrition.missing} /> : <p className="muted">{t('home.no_meals')}</p>}
        <div className="row mt"><Link className="btn soft small" to="/nutrition"><Plus size={16} />{t('nut.add')}</Link><Link className="btn ghost small" to="/recipes">{t('nav.recipes')}</Link></div>
      </Card>
    ),
    water: (
      <Card title={t('home.water')} to="/hydration" key="water">
        <div className="row between wrap">
          <div className="nowrap"><span className="big-num">{num(day.waterMl)}</span> <span className="muted">ml</span></div>
          <div className="row">
            {prefs.water_quick.slice(0, 3).map((ml) => (
              <Btn key={ml} small onClick={() => save('hydration_records', { date: d, time: nowTime(), amount_ml: ml })}>+{ml}</Btn>
            ))}
          </div>
        </div>
      </Card>
    ),
    habits: (
      <Card title={t('home.habits')} to="/habits" key="habits">
        {data.habits.length ? (
          <div className="habit-list">
            {data.habits.map((h) => {
              const done = day.habitLogs.some((l) => l.habit_id === h.id);
              return <button key={h.id} type="button" aria-pressed={done} className={cx('habit', done && 'on')} onClick={() => toggleHabit(h.id)}><span className="check">{done && <Check size={14} />}</span>{h.name}</button>;
            })}
          </div>
        ) : <p className="muted">{t('home.no_habits')}</p>}
      </Card>
    ),
    activity: (
      <Card title={t('home.activity')} to="/activity" key="activity">
        {day.has.activity
          ? <p>{day.activities.map((a) => `${t(`act.${a.type}`)} ${a.duration_min} min`).join(' · ')}</p>
          : <p className="muted">{t('home.no_activity')}</p>}
      </Card>
    ),
    week: (
      <Card title={t('home.week')} to="/calendar" key="week">
        <div className="weekstrip">
          {week.map((k) => {
            const s = data.day(k);
            return (
              <div key={k} className={cx('ws-day', k === d && 'today')}>
                <span className="muted small">{fmt(k, { weekday: 'narrow' })}</span>
                <span className="ws-num">{fromKey(k).getDate()}</span>
                <span className="dots">{DOTS.filter((x) => s.has[x]).map((x) => <i key={x} className={`dot ${x}`} />)}</span>
              </div>
            );
          })}
        </div>
        <p className="muted small mt">{t('home.week_sum', { w: week.reduce((n, k) => n + data.day(k).sessions.length, 0), s: week.filter((k) => data.day(k).has.sleep).length, n: week.filter((k) => data.day(k).has.nutrition).length })}</p>
      </Card>
    ),
    insights: (
      <Card title={t('home.insights')} to="/ai" key="insights">
        <ul className="insights">{insights.slice(0, 3).map((i, n) => <li key={n} className={i.kind}>{t(i.key, i.vars)}</li>)}</ul>
      </Card>
    ),
    goals: activeGoals.length ? (
      <Card title={t('home.goals')} to="/goals" key="goals">
        <div className="stack tight">
          {activeGoals.slice(0, 3).map((g) => (
            <div key={g.id}>
              <div className="row between"><span>{g.title}</span>{g.target ? <span className="muted small">{num(g.current, 1)} / {num(g.target, 1)} {g.unit}</span> : null}</div>
              {g.target ? <div className="bar"><i style={{ width: `${Math.min(100, (g.current / g.target) * 100)}%` }} /></div> : null}
            </div>
          ))}
        </div>
      </Card>
    ) : null,
    report: report ? (
      <Card title={t('home.report')} to="/ai" key="report" className={cx(!report.seen && 'accent')}>
        <p>{report.seen ? t('home.report_last', { from: fmt(report.period_start, { day: 'numeric', month: 'short' }), to: fmt(report.period_end, { day: 'numeric', month: 'short' }) }) : t('home.report_ready')}</p>
      </Card>
    ) : null,
    milestones: achievements.length ? (
      <Card title={t('home.milestones')} to="/habits" key="milestones">
        <div className="row wrap">
          {[...new Map(achievements.map((a) => [a.key, a])).values()].sort((a, b) => b.unlocked_at.localeCompare(a.unlocked_at)).slice(0, 3)
            .map((a) => <span key={a.id} className="pill accent"><Award size={14} /> {t(`ach.${a.key}.t`)}</span>)}
        </div>
      </Card>
    ) : null,
  };

  // Stored order + newly added widgets inserted at their default position
  const order = prefs.dashboard.order.filter((w) => WIDGETS.includes(w));
  WIDGETS.forEach((w, i) => { if (!order.includes(w)) order.splice(Math.min(i, order.length), 0, w); });
  const hidden = prefs.dashboard.hidden;
  const move = (i: number, dir: -1 | 1) => {
    const next = [...order];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    savePrefs({ dashboard: { order: next, hidden } });
  };

  const visible = order.filter((w) => !hidden.includes(w) && widgets[w]);
  const FULL = ['motivation', 'today'];
  return (
    <div className="page">
      <PageHead title={`${greeting}${profile?.display_name ? `, ${profile.display_name}` : ''}`} sub={fmt(d, { weekday: 'long', day: 'numeric', month: 'long' })}
        lead={profile?.avatar ? <img className="avatar" src={profile.avatar} alt="" /> : undefined}>
        <IconBtn label={t('home.customize')} onClick={() => setCustom(true)}><SlidersHorizontal size={20} /></IconBtn>
      </PageHead>
      {visible.filter((w) => FULL.includes(w)).map((w) => widgets[w])}
      <div className="masonry">{visible.filter((w) => !FULL.includes(w)).map((w) => widgets[w])}</div>
      <nav className="more-grid" aria-label={t('home.more')}>
        {MORE_NAV.map((n) => <Link key={n.to} to={n.to} className="more-tile"><n.icon size={22} /><span>{t(n.key)}</span></Link>)}
      </nav>
      <Sheet open={custom} onClose={() => setCustom(false)} title={t('home.customize')}>
        <p className="muted small">{t('home.customize_hint')}</p>
        <ul className="list">
          {order.map((w, i) => (
            <li key={w} className="item">
              <div className="grow">
                <Toggle label={t(`w.${w}`)} checked={!hidden.includes(w)}
                  onChange={(on) => savePrefs({ dashboard: { order, hidden: on ? hidden.filter((x) => x !== w) : [...hidden, w] } })} />
              </div>
              <IconBtn label={t('c.up')} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp size={18} /></IconBtn>
              <IconBtn label={t('c.down')} disabled={i === order.length - 1} onClick={() => move(i, 1)}><ArrowDown size={18} /></IconBtn>
            </li>
          ))}
        </ul>
      </Sheet>
    </div>
  );
}
