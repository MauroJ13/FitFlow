import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Sparkles } from 'lucide-react';
import { useT } from '../i18n';
import { today } from '../lib/date';
import { aiEnabled, aiErrorKey, runAiTask, type AiTask } from '../lib/ai';
import { usePrefs, useProfile } from '../lib/hooks';
import { Btn, Card, IconBtn, cx } from './ui';

/** Renders the small markdown subset the prompts ask for: "# " headline, "- " bullets, "→ " suggestions, **bold**. */
export function AiText({ text }: { text: string }) {
  const inline = (s: string) => s.split(/(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong>
      : part.length > 2 && part.startsWith('*') && part.endsWith('*') ? <em key={i}>{part.slice(1, -1)}</em>
        : <Fragment key={i}>{part}</Fragment>);
  const blocks: ReactNode[] = [];
  let list: { kind: 'bullet' | 'arrow'; text: string }[] = [];
  const flush = () => {
    if (!list.length) return;
    blocks.push(<ul key={`l${blocks.length}`} className="ai-list">{list.map((li, i) => <li key={i} className={li.kind}>{inline(li.text)}</li>)}</ul>);
    list = [];
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const head = line.match(/^#{1,3}\s+(.*)$/);
    const bullet = line.match(/^(?:[-*•]|\d+[.)])\s+(.*)$/);
    const arrow = line.match(/^(?:→|->)\s*(.*)$/);
    if (head) { flush(); blocks.push(<h4 key={`h${blocks.length}`} className="ai-head">{inline(head[1].replace(/\*\*/g, ''))}</h4>); }
    else if (arrow) list.push({ kind: 'arrow', text: arrow[1] });
    else if (bullet) list.push({ kind: bullet[1].startsWith('→') ? 'arrow' : 'bullet', text: bullet[1].replace(/^→\s*/, '') });
    else { flush(); blocks.push(<p key={`p${blocks.length}`}>{inline(line)}</p>); }
  }
  flush();
  return <div className="ai-text">{blocks}</div>;
}

interface Cached { day: string; text: string; model: string; at: string }
const readCache = (key: string): Cached | null => { try { return JSON.parse(localStorage.getItem(`ff_ai_${key}`) ?? 'null'); } catch { return null; } };
const writeCache = (key: string, v: Cached) => { try { localStorage.setItem(`ff_ai_${key}`, JSON.stringify(v)); } catch { /* storage full or blocked */ } };

/**
 * Card with one AI task. `auto` = generate once per day without a click (event-based, at most one request per day).
 * The result is cached per language so reopening a page never triggers another request.
 */
export function AiCard({ task, title, extra = {}, cacheKey, auto = false, className, actionLabel }: {
  task: AiTask; title: string; extra?: Record<string, string>; cacheKey: string; auto?: boolean; className?: string; actionLabel?: string;
}) {
  const { t, lang } = useT();
  const prefs = usePrefs();
  const profile = useProfile();
  const key = `${cacheKey}_${lang}`;
  const [result, setResult] = useState<Cached | null>(() => readCache(key));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const enabled = aiEnabled(prefs);
  const extraKey = JSON.stringify(extra);

  const run = useCallback(async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setBusy(true); setError('');
    try {
      const r = await runAiTask(task, prefs, profile, lang, JSON.parse(extraKey), ctrl.signal);
      const v = { day: today(), text: r.content, model: r.model, at: new Date().toISOString() };
      writeCache(key, v);
      setResult(v);
    } catch (e) {
      if (!ctrl.signal.aborted) setError(t(aiErrorKey(e)));
    } finally {
      if (abort.current === ctrl) setBusy(false);
    }
  }, [task, prefs, profile, lang, extraKey, key, t]);

  useEffect(() => { setResult(readCache(key)); setError(''); }, [key]);
  useEffect(() => {
    if (auto && enabled && navigator.onLine && readCache(key)?.day !== today()) void run();
    return () => abort.current?.abort();
  }, [auto, enabled, key]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Card className={cx('ai-card', className)} title={<span className="ai-title"><Sparkles size={16} />{title}</span>}
      action={enabled && result && !busy ? <IconBtn label={t('ai.regenerate')} onClick={() => void run()}><RefreshCw size={17} /></IconBtn> : undefined}>
      {!enabled ? (
        <div className="stack tight">
          <p className="muted small">{t('ai.disabled_hint')}</p>
          <Link className="textlink start" to="/profile">{t('ai.open_settings')}</Link>
        </div>
      ) : busy ? (
        <div className="ai-skeleton" aria-busy="true" aria-label={t('ai.thinking')}>
          <span className="sk w60" /><span className="sk" /><span className="sk w80" /><span className="sk w70" />
          <p className="muted small">{t('ai.thinking')}</p>
        </div>
      ) : error ? (
        <div className="stack tight">
          <p className="warn-box" role="alert">{error}</p>
          <Btn small onClick={() => void run()}><RefreshCw size={15} />{t('ai.retry')}</Btn>
          {result && <AiText text={result.text} />}
        </div>
      ) : result ? (
        <>
          <AiText text={result.text} />
          <p className="ai-meta">{t('ai.generated_by', { model: result.model })}{result.day !== today() ? ` · ${t('ai.from_day')}` : ''}</p>
        </>
      ) : (
        <div className="stack tight">
          <p className="muted small">{t('ai.card_hint')}</p>
          <Btn variant="primary" small onClick={() => void run()}><Sparkles size={15} />{actionLabel ?? t('ai.generate')}</Btn>
        </div>
      )}
    </Card>
  );
}
