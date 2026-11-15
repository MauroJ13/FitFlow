import { useMemo, useState, type ReactNode } from 'react';
import { Globe, Pencil, Plus, Search, Star, Trash2 } from 'lucide-react';
import type { Food, FoodState, Nutrient, Nutrients, Unit } from '../types';
import { useT } from '../i18n';
import { remove, save, useTable } from '../lib/db';
import { foodLabel, norm, useFav, useFoods } from '../lib/hooks';
import { NUTRIENTS, nutrientsFor, toGrams, unitsFor, type Totals } from '../lib/nutrition';
import { searchOpenFoodFacts, type OffFood } from '../lib/off';
import { Btn, Empty, Field, IconBtn, NumInput, Seg, Sheet, TextInput, confirmDialog, cx, toast } from './ui';

export function StateBadge({ state }: { state: FoodState }) {
  const { t } = useT();
  if (state === 'na') return null;
  return <span className={cx('badge', state)}>{t(`state.${state}`)}</span>;
}

/** kcal + macros in one line. Missing values are shown as "–", incomplete sums get a "≥". */
export function NutrientLine({ n, missing = [], approx }: { n: Nutrients | Totals; missing?: Nutrient[]; approx?: boolean }) {
  const { t, num } = useT();
  const val = (k: Nutrient, digits = 0) => (n[k] == null ? '–' : `${missing.includes(k) ? '≥ ' : approx ? '≈ ' : ''}${num(n[k] as number, digits)}`);
  return (
    <span className="nline">
      <b>{val('kcal')} kcal</b>
      <span>{t('n.p')} {val('protein', 1)} g</span>
      <span>{t('n.c')} {val('carbs', 1)} g</span>
      <span>{t('n.f')} {val('fat', 1)} g</span>
      <span>{t('n.fi')} {val('fiber', 1)} g</span>
    </span>
  );
}

/** Create or edit one of the user's own foods. Unknown values may stay empty – they are shown as missing, not as 0. */
export function FoodForm({ initial, onDone }: { initial?: Food; onDone: (f: Food) => void }) {
  const { t } = useT();
  const [name, setName] = useState(initial?.name ?? '');
  const [brand, setBrand] = useState(initial?.brand ?? '');
  const [state, setState] = useState<FoodState>(initial?.state ?? 'na');
  const [vals, setVals] = useState<Nutrients>({ kcal: initial?.kcal ?? null, protein: initial?.protein ?? null, carbs: initial?.carbs ?? null, fat: initial?.fat ?? null, fiber: initial?.fiber ?? null });
  const [density, setDensity] = useState<number | null>(initial?.density ?? null);
  const [piece, setPiece] = useState<number | null>(initial?.piece_g ?? null);
  const [err, setErr] = useState('');

  const submit = () => {
    if (!name.trim()) return setErr(t('v.name'));
    if ((vals.protein ?? 0) + (vals.carbs ?? 0) + (vals.fat ?? 0) > 100.5) return setErr(t('food.v.macros'));
    if ((vals.kcal ?? 0) > 900) return setErr(t('food.v.kcal'));
    const row = save('foods', {
      ...(initial ? { id: initial.id } : {}), name: name.trim(), names: null, brand: brand.trim() || null, state, ...vals,
      density: density && density > 0 ? density : null, piece_g: piece && piece > 0 ? piece : null,
      source: initial?.source ?? 'custom', barcode: initial?.barcode ?? null,
    });
    onDone(row);
  };
  return (
    <div className="stack">
      <Field label={t('c.name')} error={err || null}><TextInput value={name} onChange={(e) => { setName(e.target.value); setErr(''); }} placeholder={t('food.name_ph')} autoFocus /></Field>
      <Field label={t('food.brand')}><TextInput value={brand ?? ''} onChange={(e) => setBrand(e.target.value)} /></Field>
      <Field group label={t('food.state')} hint={t('food.state_hint')}>
        <Seg value={state} onChange={setState} options={[{ v: 'raw', l: t('state.raw') }, { v: 'cooked', l: t('state.cooked') }, { v: 'na', l: t('state.na') }]} />
      </Field>
      <p className="muted small">{t('food.per100')}</p>
      <div className="grid2">
        {NUTRIENTS.map((k) => (
          <Field key={k} label={`${t(`n.${k}`)} (${k === 'kcal' ? 'kcal' : 'g'})`}>
            <NumInput value={vals[k]} onChange={(v) => setVals({ ...vals, [k]: v })} placeholder="–" max={k === 'kcal' ? 900 : 100} />
          </Field>
        ))}
        <Field label={t('food.density')} hint={t('food.optional')}><NumInput value={density} onChange={setDensity} placeholder="–" /></Field>
        <Field label={t('food.piece')} hint={t('food.optional')}><NumInput value={piece} onChange={setPiece} placeholder="–" /></Field>
      </div>
      <p className="muted small">{t('food.missing_hint')}</p>
      <Btn variant="primary" block onClick={submit}>{t('c.save')}</Btn>
    </div>
  );
}

/** Search the built-in list, the user's foods and (online) Open Food Facts. */
export function FoodSearch({ onPick }: { onPick: (f: Food) => void }) {
  const { t, lang } = useT();
  const { list } = useFoods();
  const fav = useFav('food');
  const entries = useTable('food_entries');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'fav' | 'recent' | 'mine'>('all');
  const [off, setOff] = useState<OffFood[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<Food | 'new' | null>(null);

  const results = useMemo(() => {
    let base = list;
    if (tab === 'fav') base = list.filter((f) => fav.has(f.id));
    if (tab === 'mine') base = list.filter((f) => f.source !== 'builtin');
    if (tab === 'recent') {
      const seen = new Set<string>();
      const byId = new Map(list.map((f) => [f.id, f]));
      base = [...entries].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
        .map((e) => (e.food_id && !seen.has(e.food_id) && seen.add(e.food_id) ? byId.get(e.food_id) : undefined))
        .filter((f): f is Food => !!f);
    }
    const nq = norm(q);
    if (nq) {
      const words = nq.split(/\s+/);
      base = base.filter((f) => { const hay = norm(`${foodLabel(f, lang)} ${f.name} ${f.brand ?? ''}`); return words.every((w) => hay.includes(w)); });
    }
    return base.slice(0, 80);
  }, [list, tab, q, lang, fav, entries]);

  const searchOnline = async () => {
    if (q.trim().length < 2) return;
    if (!navigator.onLine) { setErr(t('food.off_offline')); return; }
    setBusy(true); setErr('');
    try { setOff(await searchOpenFoodFacts(q, lang)); } catch { setErr(t('food.off_error')); setOff(null); } finally { setBusy(false); }
  };
  const pickOff = (o: OffFood) => {
    const existing = o.barcode ? list.find((f) => f.barcode === o.barcode && f.source === 'off') : undefined;
    onPick(existing ?? save('foods', o));
  };

  if (form) return <FoodForm initial={form === 'new' ? undefined : form} onDone={(f) => { setForm(null); toast(t('c.saved')); if (form === 'new') onPick(f); }} />;

  return (
    <div className="stack">
      <div className="searchbar">
        <Search size={18} />
        <input value={q} onChange={(e) => { setQ(e.target.value); setOff(null); }} placeholder={t('food.search_ph')} autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter') void searchOnline(); }} />
      </div>
      <Seg value={tab} onChange={setTab} options={[{ v: 'all', l: t('c.all') }, { v: 'recent', l: t('food.recent') }, { v: 'fav', l: t('c.favorites') }, { v: 'mine', l: t('food.mine') }]} />
      <ul className="list">
        {results.map((f) => (
          <li key={f.id} className="item">
            <button type="button" className="item-main" onClick={() => onPick(f)}>
              <span className="item-title">{foodLabel(f, lang)} <StateBadge state={f.state} />{f.source === 'off' && <span className="badge">OFF</span>}</span>
              <span className="muted small">{f.brand ? `${f.brand} · ` : ''}{f.kcal == null ? '–' : Math.round(f.kcal)} kcal · {t('n.p')} {f.protein ?? '–'} g / 100 g</span>
            </button>
            {f.source !== 'builtin' && <IconBtn label={t('c.edit')} onClick={() => setForm(f)}><Pencil size={16} /></IconBtn>}
            {f.source !== 'builtin' && (
              <IconBtn label={t('c.delete')} onClick={async () => { if (await confirmDialog(t('food.delete_q', { name: f.name }))) remove('foods', f.id); }}><Trash2 size={16} /></IconBtn>
            )}
            <IconBtn label={t('c.favorite')} className={cx(fav.has(f.id) && 'on')} onClick={() => fav.toggle(f.id)}><Star size={18} /></IconBtn>
          </li>
        ))}
      </ul>
      {!results.length && <Empty title={t('food.none')} text={t('food.none_hint')} />}
      {off && (
        <>
          <h4 className="section-title">Open Food Facts</h4>
          {!off.length && <p className="muted small">{t('food.off_none')}</p>}
          <ul className="list">
            {off.map((o, i) => (
              <li key={`${o.barcode}-${i}`} className="item">
                <button type="button" className="item-main" onClick={() => pickOff(o)}>
                  <span className="item-title">{o.name}</span>
                  <span className="muted small">{o.brand ? `${o.brand} · ` : ''}{o.kcal == null ? t('food.no_values') : `${Math.round(o.kcal)} kcal / 100 g`}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
      {err && <p className="field-error">{err}</p>}
      <div className="row wrap">
        <Btn onClick={searchOnline} disabled={busy || q.trim().length < 2}><Globe size={16} />{busy ? t('c.loading') : t('food.search_off')}</Btn>
        <Btn onClick={() => setForm('new')}><Plus size={16} />{t('food.create')}</Btn>
      </div>
      <p className="muted small">{t('food.ref_note')}</p>
    </div>
  );
}

export interface AmountResult { amount: number; unit: Unit; grams: number; estimated: boolean }
/** Quantity + unit for one food, with a live nutrition preview. */
export function AmountSheet({ food, initial, onClose, onConfirm, confirmLabel, children }: {
  food: Food | null; initial?: { amount: number; unit: Unit }; onClose: () => void; onConfirm: (r: AmountResult) => void; confirmLabel?: string; children?: ReactNode;
}) {
  const { t, lang } = useT();
  const [amount, setAmount] = useState<number | null>(initial?.amount ?? 100);
  const [unit, setUnit] = useState<Unit>(initial?.unit ?? 'g');
  if (!food) return null;
  const { grams, estimated } = toGrams(food, amount ?? 0, unit);
  const n = nutrientsFor(food, grams);
  const missing = NUTRIENTS.filter((k) => food[k] == null);
  const valid = amount != null && amount > 0 && grams > 0 && grams <= 5000;
  return (
    <Sheet open onClose={onClose} title={foodLabel(food, lang)}
      footer={<Btn variant="primary" block disabled={!valid} onClick={() => valid && onConfirm({ amount: amount as number, unit, grams, estimated })}>{confirmLabel ?? t('c.add')}</Btn>}>
      <div className="stack">
        <div className="row"><StateBadge state={food.state} />{food.brand && <span className="muted small">{food.brand}</span>}</div>
        {food.state !== 'na' && <p className="hint-box">{t(food.state === 'raw' ? 'food.weigh_raw' : 'food.weigh_cooked')}</p>}
        <div className="grid2">
          <Field label={t('c.amount')}><NumInput value={amount} onChange={setAmount} max={5000} autoFocus /></Field>
          <Field label={t('c.unit')}>
            <select className="input" value={unit} onChange={(e) => setUnit(e.target.value as Unit)}>
              {unitsFor(food).map((u) => <option key={u} value={u}>{t(`unit.${u}`)}</option>)}
            </select>
          </Field>
        </div>
        {unit !== 'g' && <p className="muted small">≈ {Math.round(grams)} g{estimated ? ` · ${t('food.estimated')}` : ''}</p>}
        <div className="preview"><NutrientLine n={n} approx={estimated} /></div>
        {missing.length > 0 && <p className="warn-box">{t('food.missing', { list: missing.map((k) => t(`n.${k}`)).join(', ') })}</p>}
        {children}
      </div>
    </Sheet>
  );
}
