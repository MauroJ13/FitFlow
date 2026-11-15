import { useEffect, useRef, useState } from 'react';
import { Square } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { Bot, ChefHat, RefreshCw, Send, Sparkles, Trash2 } from 'lucide-react';
import type { AiReport } from '../types';
import { useT } from '../i18n';
import { useAuth } from '../lib/auth';
import { newId, remove, save, useTable } from '../lib/db';
import { addDays, fmtDuration, today, weekStart } from '../lib/date';
import { PROVIDER_CREDIT, aiChat, aiEnabled, aiErrorKey, buildContext, parseRecipeAction, systemPrompt, type ChatMsg, type RecipeDraftAction } from '../lib/ai';
import { AiCard, AiText } from '../components/AiCard';
import { foodLabel, getFoodList, usePrefs, useProfile } from '../lib/hooks';
import { buildInsights } from '../lib/insights';
import { bestMatch } from '../lib/match';
import { createWeeklyReport, lastFullWeek } from '../lib/report';
import { periodStats, useData } from '../lib/stats';
import { Btn, Card, Empty, IconBtn, PageHead, Seg, confirmDialog, cx, toast } from '../components/ui';
import type { BuilderState } from './RecipeBuilder';

interface UiMsg { id: string; role: 'user' | 'assistant'; content: string; action?: RecipeDraftAction | null; error?: boolean }
/** The conversation lives in memory only: it is not stored and not synchronised. */
let memory: UiMsg[] = [];

export default function AiPage() {
  const { t, lang, date: fmt, num } = useT();
  const nav = useNavigate();
  const auth = useAuth();
  const prefs = usePrefs();
  const profile = useProfile();
  const data = useData();
  const reports = useTable('ai_reports');
  const [tab, setTab] = useState<'chat' | 'reports' | 'insights'>('chat');
  const [msgs, setMsgs] = useState<UiMsg[]>(memory);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [making, setMaking] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  const ready = aiEnabled(prefs);
  const abortRef = useRef<AbortController | null>(null);
  const shared = (Object.keys(prefs.ai.share) as (keyof typeof prefs.ai.share)[]).filter((k) => prefs.ai.share[k]);
  useEffect(() => { memory = msgs; endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs]);
  // opening the reports tab marks reports as read
  useEffect(() => { if (tab === 'reports') reports.filter((r) => !r.seen).forEach((r) => save('ai_reports', { id: r.id, seen: true })); }, [tab, reports]);

  const send = async (text: string) => {
    const q = text.trim();
    if (!q || busy) return;
    const history = [...msgs, { id: newId(), role: 'user' as const, content: q }];
    setMsgs(history); setInput(''); setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const payload: ChatMsg[] = [
        { role: 'system', content: `${systemPrompt(lang, profile)}\n\n--- USER DATA (shared with permission) ---\n${buildContext(prefs, profile, lang)}` },
        ...history.filter((m) => !m.error).slice(-12).map((m) => ({ role: m.role, content: m.content })),
      ];
      const res = await aiChat(payload, { temperature: 0.6, signal: ctrl.signal });
      const { clean, action } = parseRecipeAction(res.content);
      setMsgs([...history, { id: newId(), role: 'assistant', content: clean || res.content, action }]);
    } catch (e) {
      if (ctrl.signal.aborted) setMsgs(history);
      else setMsgs([...history, { id: newId(), role: 'assistant', content: t(aiErrorKey(e)), error: true }]);
    } finally { setBusy(false); abortRef.current = null; }
  };

  /** Turn an AI recipe proposal into a draft in the Recipe Builder. The user reviews and saves it there. */
  const openDraft = (a: RecipeDraftAction) => {
    const foods = getFoodList();
    const unmatched: string[] = [];
    const ings = a.ingredients.flatMap((i) => {
      const m = bestMatch(i.name, foods, (f) => [f.name, f.names?.en, f.names?.de, f.names?.hr], 0.45);
      if (!m) { unmatched.push(`${i.name} (${i.grams} g)`); return []; }
      return [{ id: newId(), food_id: m.item.id, label: foodLabel(m.item, lang), amount: i.grams, unit: 'g' as const, grams: i.grams }];
    });
    const state: BuilderState = { draft: { name: a.name, portions: a.portions, notes: '', ings }, unmatched };
    nav('/recipes/new', { state });
  };

  const makeReport = async (week: string) => {
    setMaking(week);
    try { await createWeeklyReport(week, !!auth.user, lang); toast(t('ai.report_ready')); } finally { setMaking(''); }
  };
  const thisWeek = weekStart(today());
  const sorted = [...reports].sort((a, b) => b.period_start.localeCompare(a.period_start));
  const live = buildInsights(periodStats(data, addDays(today(), -6), today()), periodStats(data, addDays(today(), -13), addDays(today(), -7)), prefs);
  const suggestions = ['ai.s1', 'ai.s2', 'ai.s3', 'ai.s4', 'ai.s5', 'ai.s6'];

  const statRows = (r: AiReport): [string, string][] => {
    const s = r.stats;
    const rows: [string, string | null][] = [
      [t('prog.workouts'), s.workouts ? String(s.workouts) : null],
      [t('prog.sets'), s.sets ? String(s.sets) : null],
      [t('prog.sleep_avg'), s.avgSleepMin != null ? fmtDuration(s.avgSleepMin) : null],
      [t('sleep.consistency'), s.bedtimeSd != null ? `± ${s.bedtimeSd} min` : null],
      [t('prog.nutrition_days'), s.nutritionDays ? `${s.nutritionDays}/7` : null],
      [t('prog.water_avg'), s.avgWaterMl != null ? `${num(s.avgWaterMl)} ml` : null],
      [t('prog.activity_min'), s.activityMin ? `${s.activityMin} min` : null],
      [t('prog.habit_checks'), s.habitChecks ? String(s.habitChecks) : null],
    ];
    return rows.filter((x): x is [string, string] => x[1] != null);
  };

  return (
    <div className="page ai-page">
      <PageHead title={t('nav.ai')} sub={t('ai.sub')} />
      <Seg value={tab} onChange={setTab} options={[{ v: 'chat', l: t('ai.chat') }, { v: 'reports', l: t('ai.reports') }, { v: 'insights', l: t('ai.insights') }]} />

      {tab === 'chat' && (!ready ? (
        <Card>
          <Empty icon={<Bot size={32} />} title={t('ai.off_title')} text={t('ai.off_text')}>
            <Link className="btn primary" to="/profile">{t('ai.open_settings')}</Link>
          </Empty>
        </Card>
      ) : (
        <div className="chat">
          <p className="muted small">
            {t('ai.shares', { list: shared.length ? shared.map((k) => t(`share.${k}`)).join(', ') : t('ai.shares_none') })} · <Link to="/profile" className="textlink">{t('ai.change')}</Link>
          </p>
          <div className="chat-log">
            {!msgs.length && (
              <div className="chat-suggest">
                <p className="muted">{t('ai.try')}</p>
                {suggestions.map((s) => <button key={s} type="button" className="chip" onClick={() => void send(t(s))}>{t(s)}</button>)}
              </div>
            )}
            {msgs.map((m) => (
              <div key={m.id} className={cx('bubble', m.role, m.error && 'error')}>
                {m.role === 'assistant' && !m.error ? <AiText text={m.content} /> : m.content.split('\n').map((line, i) => <p key={i}>{line}</p>)}
                {m.action && <Btn variant="primary" small onClick={() => openDraft(m.action!)}><ChefHat size={16} />{t('ai.open_recipe')}</Btn>}
              </div>
            ))}
            {busy && <div className="bubble assistant typing"><span /><span /><span /></div>}
            <div ref={endRef} />
          </div>
          <form className="chat-input" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <input className="input grow" value={input} onChange={(e) => setInput(e.target.value)} placeholder={t('ai.placeholder')} maxLength={1500} />
            {busy
              ? <Btn type="button" onClick={() => abortRef.current?.abort()} aria-label={t('ai.stop')}><Square size={16} /></Btn>
              : <Btn variant="primary" type="submit" disabled={!input.trim()} aria-label={t('ai.send')}><Send size={18} /></Btn>}
            {msgs.length > 0 && <IconBtn label={t('ai.clear')} onClick={() => setMsgs([])}><Trash2 size={18} /></IconBtn>}
          </form>
          <p className="muted small">{t('ai.disclaimer')} {t('ai.credit', { provider: PROVIDER_CREDIT })}</p>
        </div>
      ))}

      {tab === 'reports' && (
        <div className="stack">
          <div className="row wrap">
            <Btn variant="primary" disabled={!!making} onClick={() => makeReport(lastFullWeek())}><Sparkles size={16} />{making === lastFullWeek() ? t('c.loading') : t('ai.make_last')}</Btn>
            <Btn disabled={!!making} onClick={() => makeReport(thisWeek)}>{making === thisWeek ? t('c.loading') : t('ai.make_this')}</Btn>
          </div>
          <p className="muted small">{ready ? t('ai.report_ai') : t('ai.report_rules')}</p>
          {!sorted.length && <Empty icon={<Sparkles size={32} />} title={t('ai.no_reports')} text={t('ai.no_reports_hint')} />}
          {sorted.map((r) => (
            <Card key={r.id} title={`${fmt(r.period_start, { day: 'numeric', month: 'short' })} – ${fmt(r.period_end, { day: 'numeric', month: 'short', year: 'numeric' })}`}
              action={<div className="row">
                <IconBtn label={t('ai.regenerate')} disabled={!!making} onClick={() => makeReport(r.period_start)}><RefreshCw size={17} className={making === r.period_start ? 'spin' : ''} /></IconBtn>
                <IconBtn label={t('c.delete')} onClick={async () => { if (await confirmDialog(t('ai.delete_report_q'))) remove('ai_reports', r.id); }}><Trash2 size={17} /></IconBtn>
              </div>}>
              <div className="kpis compact">{statRows(r).map(([k, v]) => <div key={k} className="kpi"><span className="muted small">{k}</span><b>{v}</b></div>)}</div>
              <div className="report-text"><AiText text={r.content} /></div>
              <p className="muted small">{r.source === 'ai' ? t('ai.by_ai', { model: r.model }) : t('ai.by_rules')}</p>
            </Card>
          ))}
        </div>
      )}

      {tab === 'insights' && (
        <div className="cols-2">
          <AiCard task="focus" title={t('ai.focus_title')} cacheKey="focus" />
          <AiCard task="sleep" title={t('ai.sleep_title')} cacheKey="sleep" />
          <Card title={t('ai.insights_title')}>
            <p className="muted small">{t('ai.insights_hint')}</p>
            <ul className="insights">
              {live.map((i, n) => <li key={n} className={i.kind}>{t(i.key, i.vars)}</li>)}
            </ul>
          </Card>
        </div>
      )}
    </div>
  );
}
