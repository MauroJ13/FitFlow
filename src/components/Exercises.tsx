import { useMemo, useState } from 'react';
import { Pencil, Search, ShieldCheck, Star, Trash2 } from 'lucide-react';
import type { Exercise } from '../types';
import { useT } from '../i18n';
import { CATEGORIES, EQUIPMENT, MUSCLES, SAFETY_TIPS } from '../data';
import { remove, save } from '../lib/db';
import { exInstructions, exName, norm, useExercises, useFav } from '../lib/hooks';
import { MuscleMap } from './MuscleMap';
import { Btn, Chips, Empty, Field, IconBtn, Seg, Sheet, TextInput, confirmDialog, cx, toast } from './ui';

export function ExerciseList({ onPick, compact }: { onPick: (e: Exercise) => void; compact?: boolean }) {
  const { t, lang } = useT();
  const { list } = useExercises();
  const fav = useFav('exercise');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('all');
  const [eq, setEq] = useState('all');
  const results = useMemo(() => {
    const nq = norm(q);
    return list
      .filter((e) => (cat === 'all' ? true : cat === 'fav' ? fav.has(e.id) : cat === 'mine' ? e.source === 'custom' : e.category === cat))
      .filter((e) => eq === 'all' || e.equipment_id === eq)
      .filter((e) => !nq || norm(`${exName(e, lang)} ${e.name} ${t(`eq.${e.equipment_id}`)}`).includes(nq))
      .sort((a, b) => exName(a, lang).localeCompare(exName(b, lang), lang));
  }, [list, q, cat, eq, lang, fav, t]);
  return (
    <div className="stack">
      <div className="searchbar"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ex.search_ph')} /></div>
      <div className="hscroll">
        {['all', 'fav', 'mine', ...CATEGORIES].map((c) => (
          <button key={c} type="button" className={cx('chip', cat === c && 'on')} onClick={() => setCat(c)}>
            {c === 'all' ? t('c.all') : c === 'fav' ? t('c.favorites') : c === 'mine' ? t('ex.mine') : t(`cat.${c}`)}
          </button>
        ))}
      </div>
      {!compact && (
        <select className="input" value={eq} onChange={(e) => setEq(e.target.value)} aria-label={t('ex.equipment')}>
          <option value="all">{t('ex.all_equipment')}</option>
          {EQUIPMENT.map((x) => <option key={x} value={x}>{t(`eq.${x}`)}</option>)}
        </select>
      )}
      <ul className="list">
        {results.map((e) => (
          <li key={e.id} className="item">
            <button type="button" className="item-main" onClick={() => onPick(e)}>
              <span className="item-title">{exName(e, lang)}{e.source === 'custom' && <span className="badge">{t('ex.custom')}</span>}</span>
              <span className="muted small">{t(`cat.${e.category}`)} · {t(`eq.${e.equipment_id}`)}</span>
            </button>
            <IconBtn label={t('c.favorite')} className={cx(fav.has(e.id) && 'on')} onClick={() => fav.toggle(e.id)}><Star size={18} /></IconBtn>
          </li>
        ))}
      </ul>
      {!results.length && <Empty title={t('ex.none')} text={t('ex.none_hint')} />}
    </div>
  );
}

export function ExercisePicker({ open, onClose, onPick }: { open: boolean; onClose: () => void; onPick: (e: Exercise) => void }) {
  const { t } = useT();
  return <Sheet open={open} onClose={onClose} title={t('ex.pick')}><ExerciseList compact onPick={onPick} /></Sheet>;
}

export function ExerciseForm({ initial, onDone }: { initial?: Partial<Exercise>; onDone: (e: Exercise) => void }) {
  const { t } = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [category, setCategory] = useState(initial?.category ?? 'chest');
  const [equipment, setEquipment] = useState(initial?.equipment_id ?? 'machine');
  const [muscles, setMuscles] = useState<string[]>(initial?.muscles ?? []);
  const [secondary, setSecondary] = useState<string[]>(initial?.secondary ?? []);
  const [difficulty, setDifficulty] = useState(String(initial?.difficulty ?? 1));
  const [instructions, setInstructions] = useState(initial?.instructions ?? '');
  const [safety, setSafety] = useState(initial?.safety ?? '');
  const [tips, setTips] = useState<string[]>(initial?.tips ?? []);
  const [err, setErr] = useState('');
  const toggle = (list: string[], set: (v: string[]) => void) => (v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const muscleOpts = MUSCLES.map((m) => ({ v: m, l: t(`mus.${m}`) }));
  const submit = () => {
    if (!name.trim()) return setErr(t('v.name'));
    onDone(save('exercises', {
      ...(initial?.id && initial.source === 'custom' ? { id: initial.id } : {}),
      name: name.trim(), names: null, category, equipment_id: equipment, muscles, secondary: secondary.filter((m) => !muscles.includes(m)),
      difficulty: Number(difficulty), instructions: instructions.trim(), instructions_i18n: null, tips, safety: safety.trim(), source: 'custom',
    }));
  };
  return (
    <div className="stack">
      <Field label={t('c.name')} error={err || null}><TextInput value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} autoFocus /></Field>
      <div className="grid2">
        <Field label={t('ex.category')}>
          <select className="input" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{t(`cat.${c}`)}</option>)}</select>
        </Field>
        <Field label={t('ex.equipment')}>
          <select className="input" value={equipment} onChange={(e) => setEquipment(e.target.value)}>{EQUIPMENT.map((c) => <option key={c} value={c}>{t(`eq.${c}`)}</option>)}</select>
        </Field>
      </div>
      <Field group label={t('ex.difficulty')}>
        <Seg value={difficulty} onChange={setDifficulty} options={[{ v: '1', l: t('diff.1') }, { v: '2', l: t('diff.2') }, { v: '3', l: t('diff.3') }]} />
      </Field>
      <div className="field"><span className="field-label">{t('ex.muscles')}</span><Chips options={muscleOpts} value={muscles} onToggle={toggle(muscles, setMuscles)} /></div>
      <div className="field"><span className="field-label">{t('ex.secondary')}</span><Chips options={muscleOpts} value={secondary} onToggle={toggle(secondary, setSecondary)} /></div>
      <Field label={t('ex.instructions')}><textarea className="input" rows={4} value={instructions} onChange={(e) => setInstructions(e.target.value)} /></Field>
      <div className="field"><span className="field-label">{t('ex.safety')}</span>
        <Chips options={SAFETY_TIPS.map((k) => ({ v: k, l: t(`tip.${k}.s`) }))} value={tips} onToggle={toggle(tips, setTips)} />
      </div>
      <Field label={t('ex.safety_note')}><textarea className="input" rows={2} value={safety} onChange={(e) => setSafety(e.target.value)} /></Field>
      <Btn variant="primary" block onClick={submit}>{t('c.save')}</Btn>
    </div>
  );
}

export function ExerciseDetail({ exercise, onClose, onOpen }: { exercise: Exercise | null; onClose: () => void; onOpen?: (e: Exercise) => void }) {
  const { t, lang } = useT();
  const fav = useFav('exercise');
  const { list: all } = useExercises();
  const [editing, setEditing] = useState(false);
  if (!exercise) return null;
  const e = exercise;
  const close = () => { setEditing(false); onClose(); };
  /** Same category and at least one shared primary muscle. */
  const alternatives = all.filter((a) => a.id !== e.id && a.category === e.category && a.muscles.some((m) => e.muscles.includes(m))).slice(0, 5);
  if (editing) {
    return (
      <Sheet open onClose={close} title={e.source === 'custom' ? t('ex.edit') : t('ex.customize')}>
        {e.source === 'builtin' && <p className="hint-box">{t('ex.customize_hint')}</p>}
        <ExerciseForm
          initial={e.source === 'custom' ? e : { ...e, name: exName(e, lang), instructions: exInstructions(e, lang) }}
          onDone={() => { toast(t('c.saved')); close(); }}
        />
      </Sheet>
    );
  }
  return (
    <Sheet open onClose={close} title={exName(e, lang)}
      footer={<>
        <Btn onClick={() => fav.toggle(e.id)}><Star size={16} className={cx(fav.has(e.id) && 'filled')} />{fav.has(e.id) ? t('c.unfavorite') : t('c.favorite')}</Btn>
        <Btn onClick={() => setEditing(true)}><Pencil size={16} />{e.source === 'custom' ? t('c.edit') : t('ex.customize')}</Btn>
        {e.source === 'custom' && (
          <Btn variant="danger" onClick={async () => { if (await confirmDialog(t('ex.delete_q', { name: e.name }))) { remove('exercises', e.id); close(); } }}><Trash2 size={16} /></Btn>
        )}
      </>}>
      <div className="stack">
        <div className="exercise-hero">
          <MuscleMap primary={e.muscles} secondary={e.secondary} className="musclemap" />
          <div className="stack tight">
            <span className="pill">{t(`cat.${e.category}`)}</span>
            <span className="pill">{t(`eq.${e.equipment_id}`)}</span>
            <span className="pill">{t('ex.difficulty')}: {t(`diff.${e.difficulty}`)}</span>
          </div>
        </div>
        <p className="muted small">{t('ex.map_note')}</p>
        {e.muscles.length > 0 && <p><b>{t('ex.muscles')}:</b> {e.muscles.map((m) => t(`mus.${m}`)).join(', ')}</p>}
        {e.secondary.length > 0 && <p className="muted"><b>{t('ex.secondary')}:</b> {e.secondary.map((m) => t(`mus.${m}`)).join(', ')}</p>}
        <div>
          <h4 className="section-title">{t('ex.instructions')}</h4>
          <p>{exInstructions(e, lang) || t('ex.no_instructions')}</p>
        </div>
        {(e.tips.length > 0 || e.safety) && (
          <div className="safety">
            <h4 className="section-title"><ShieldCheck size={16} /> {t('ex.safety')}</h4>
            <ul>
              {e.tips.map((k) => <li key={k}>{t(`tip.${k}`)}</li>)}
              {e.safety && <li>{e.safety}</li>}
            </ul>
          </div>
        )}
        {alternatives.length > 0 && (
          <div>
            <h4 className="section-title">{t('ex.alternatives')}</h4>
            <div className="chips">
              {alternatives.map((a) => <button key={a.id} type="button" className="chip" disabled={!onOpen} onClick={() => onOpen?.(a)}>{exName(a, lang)}</button>)}
            </div>
          </div>
        )}
        <p className="muted small">{t('ex.disclaimer')}</p>
      </div>
    </Sheet>
  );
}
