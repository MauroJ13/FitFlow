import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileUp, Sparkles, Trash2 } from 'lucide-react';
import type { Exercise } from '../types';
import { useT } from '../i18n';
import { newId, save } from '../lib/db';
import { aiChat, aiEnabled, aiErrorKey } from '../lib/ai';
import { exName, useExercises, usePrefs } from '../lib/hooks';
import { bestMatch } from '../lib/match';
import { extractImageText, extractPdfText, parsePlanText, type ParsedRow } from '../lib/planParser';
import { ExercisePicker } from '../components/Exercises';
import { Btn, Card, Empty, Field, IconBtn, NumInput, PageHead, TextInput, toast } from '../components/ui';

interface Row extends ParsedRow { key: string; include: boolean }

/** Upload a PDF or photo of a plan → extracted rows → the user reviews and corrects → only then a plan is created. */
export default function PlanImport() {
  const { t, lang } = useT();
  const nav = useNavigate();
  const prefs = usePrefs();
  const { list, map } = useExercises();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [planName, setPlanName] = useState('');
  const [pickFor, setPickFor] = useState<string | null>(null);

  const toRows = (parsed: ParsedRow[]): Row[] => parsed.map((r) => ({ ...r, key: newId(), include: true }));
  const upd = (key: string, patch: Partial<Row>) => setRows((rs) => rs && rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(''); setRows(null); setText('');
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const isImage = file.type.startsWith('image/');
    if (!isPdf && !isImage) return setError(t('imp.v.type'));
    if (file.size > 15 * 1024 * 1024) return setError(t('imp.v.size'));
    try {
      setBusy(isPdf ? t('imp.reading_pdf') : t('imp.reading_image'));
      const raw = isPdf ? await extractPdfText(file) : await extractImageText(file, lang);
      setText(raw);
      setPlanName(file.name.replace(/\.[^.]+$/, '').slice(0, 60));
      if (raw.trim().length < 10) { setError(isPdf ? t('imp.no_text_pdf') : t('imp.no_text')); return; }
      setRows(toRows(parsePlanText(raw, list)));
    } catch (e) {
      console.error(e);
      setError(isPdf ? t('imp.failed') : t('imp.failed_ocr'));
    } finally {
      setBusy('');
      if (input.current) input.current.value = '';
    }
  };

  /** Optional: let the AI structure the already extracted text. The result still goes through the same review. */
  const improveWithAi = async () => {
    setBusy(t('imp.ai_working')); setError('');
    try {
      const res = await aiChat([
        { role: 'system', content: 'You extract workout plans from raw text. Reply with JSON only: an array of objects {"day": string, "name": string, "sets": number, "reps": string, "rest": number|null}. "rest" is in seconds. Only include exercises that are really in the text. Never invent exercises or numbers; use null or "" when a value is not in the text.' },
        { role: 'user', content: text.slice(0, 8000) },
      ], { temperature: 0.1 });
      const json = res.content.match(/\[[\s\S]*\]/);
      const arr = json ? JSON.parse(json[0]) : null;
      if (!Array.isArray(arr) || !arr.length) throw new Error('no rows');
      setRows(toRows(arr.filter((r) => typeof r?.name === 'string' && r.name.trim()).map((r): ParsedRow => {
        const m = bestMatch(String(r.name), list, (e) => [e.name, e.names?.en, e.names?.de, e.names?.hr]);
        return { raw: String(r.name), day: String(r.day ?? ''), name: String(r.name), sets: Number(r.sets) > 0 ? Math.round(Number(r.sets)) : null, reps: String(r.reps ?? ''), rest: Number(r.rest) > 0 ? Math.round(Number(r.rest)) : null, exercise_id: m?.item.id ?? null, score: m?.score ?? 0 };
      })));
    } catch (e) {
      console.error(e);
      setError(e instanceof Error && e.name === 'AiError' ? t(aiErrorKey(e)) : t('imp.ai_failed'));
    } finally { setBusy(''); }
  };

  const included = rows?.filter((r) => r.include) ?? [];
  const invalid = included.filter((r) => !r.name.trim() || !r.sets || r.sets < 1);
  const create = () => {
    if (!included.length || invalid.length) return;
    const plan = save('workout_plans', { name: planName.trim() || t('gym.new_plan_name'), notes: t('imp.plan_note') });
    const dayIds = new Map<string, string>();
    const perDay = new Map<string, number>();
    for (const r of included) {
      const dayName = r.day.trim() || `${t('gym.day')} 1`;
      let dayId = dayIds.get(dayName);
      if (!dayId) {
        dayId = save('workout_days', { plan_id: plan.id, name: dayName, position: dayIds.size, weekdays: [] }).id;
        dayIds.set(dayName, dayId);
      }
      // unknown exercise names become custom exercises the user can complete later
      const exerciseId = r.exercise_id ?? save('exercises', {
        name: r.name.trim(), names: null, category: 'chest', equipment_id: 'other', muscles: [], secondary: [], difficulty: 1,
        instructions: '', instructions_i18n: null, tips: [], safety: '', source: 'custom',
      }).id;
      const pos = perDay.get(dayId) ?? 0;
      perDay.set(dayId, pos + 1);
      save('workout_exercises', { plan_id: plan.id, day_id: dayId, exercise_id: exerciseId, position: pos, sets: r.sets as number, reps: r.reps || '10', rest_seconds: r.rest ?? 90, notes: '' });
    }
    toast(t('imp.created'));
    nav(`/gym/plan/${plan.id}`, { replace: true });
  };

  return (
    <div className="page">
      <PageHead title={t('gym.import')} sub={t('imp.sub')} back="/gym" />
      <Card>
        <div className="stack">
          <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={(e) => void onFile(e.target.files?.[0])} />
          <Btn variant="primary" disabled={!!busy} onClick={() => input.current?.click()}><FileUp size={18} />{busy || t('imp.choose')}</Btn>
          <p className="muted small">{t('imp.privacy')}</p>
          {error && <p className="warn-box"><AlertTriangle size={16} /> {error}</p>}
        </div>
      </Card>

      {rows && (
        <>
          <Card title={t('imp.review')}>
            <p className="hint-box">{t('imp.review_hint')}</p>
            {!rows.length && <Empty title={t('imp.nothing')} text={t('imp.nothing_hint')} />}
            <Field label={t('gym.plan_name')}><TextInput value={planName} onChange={(e) => setPlanName(e.target.value)} /></Field>
            <ul className="list imp-list">
              {rows.map((r) => {
                const ex: Exercise | undefined = r.exercise_id ? map.get(r.exercise_id) : undefined;
                return (
                  <li key={r.key} className={`imp-row ${r.include ? '' : 'off'}`}>
                    <div className="row">
                      <input type="checkbox" checked={r.include} onChange={(e) => upd(r.key, { include: e.target.checked })} aria-label={t('imp.include')} />
                      <TextInput className="grow" value={r.name} onChange={(e) => upd(r.key, { name: e.target.value, exercise_id: null, score: 0 })} aria-label={t('c.name')} />
                      <IconBtn label={t('c.delete')} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}><Trash2 size={16} /></IconBtn>
                    </div>
                    <div className="row wrap">
                      <button type="button" className={`chip ${ex ? 'on' : ''}`} onClick={() => setPickFor(r.key)}>
                        {ex ? `${t('imp.matched')}: ${exName(ex, lang)}` : t('imp.unmatched')}
                      </button>
                      {ex && r.score < 0.8 && <span className="badge warn">{t('imp.check')}</span>}
                    </div>
                    <div className="grid3">
                      <Field label={t('gym.sets')}><NumInput value={r.sets} max={20} onChange={(v) => upd(r.key, { sets: v == null ? null : Math.round(v) })} /></Field>
                      <Field label={t('gym.reps')}><TextInput value={r.reps} onChange={(e) => upd(r.key, { reps: e.target.value.slice(0, 12) })} /></Field>
                      <Field label={t('gym.rest_s')}><NumInput value={r.rest} max={900} placeholder="90" onChange={(v) => upd(r.key, { rest: v == null ? null : Math.round(v) })} /></Field>
                    </div>
                    <Field label={t('gym.day_name')}><TextInput value={r.day} placeholder={`${t('gym.day')} 1`} onChange={(e) => upd(r.key, { day: e.target.value })} /></Field>
                    <p className="muted small">{t('imp.source')}: “{r.raw}”</p>
                  </li>
                );
              })}
            </ul>
            {invalid.length > 0 && <p className="field-error">{t('imp.v.rows', { n: invalid.length })}</p>}
            <div className="row wrap">
              <Btn variant="primary" disabled={!included.length || invalid.length > 0} onClick={create}>{t('imp.create', { n: included.length })}</Btn>
              {aiEnabled(prefs) && <Btn disabled={!!busy} onClick={improveWithAi}><Sparkles size={16} />{t('imp.ai')}</Btn>}
            </div>
          </Card>
          <Card title={t('imp.raw')}>
            <pre className="rawtext">{text}</pre>
          </Card>
        </>
      )}

      <ExercisePicker open={!!pickFor} onClose={() => setPickFor(null)} onPick={(e) => { if (pickFor) upd(pickFor, { exercise_id: e.id, score: 1 }); setPickFor(null); }} />
    </div>
  );
}
