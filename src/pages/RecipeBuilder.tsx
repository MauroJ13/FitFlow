import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, Copy, Plus, Star, Trash2, Utensils } from 'lucide-react';
import type { Food, Meal, Unit } from '../types';
import { useT } from '../i18n';
import { MEALS } from '../data';
import { newId, remove, save, useTable } from '../lib/db';
import { today } from '../lib/date';
import { foodLabel, useFav, useFoods } from '../lib/hooks';
import { NUTRIENTS, recipeCalc, scale, totalsToNutrients } from '../lib/nutrition';
import { AmountSheet, FoodSearch, NutrientLine, StateBadge } from '../components/Food';
import { Btn, Card, Empty, Field, IconBtn, NumInput, PageHead, Sheet, TextInput, confirmDialog, toast } from '../components/ui';
import { duplicateRecipe } from './Recipes';

export interface DraftIng { id: string; food_id: string; label: string; amount: number; unit: Unit; grams: number }
export interface RecipeDraft { name: string; portions: number | null; notes: string; ings: DraftIng[] }
/** Navigation state used by the AI assistant to pre-fill a draft the user then reviews. */
export interface BuilderState { draft?: RecipeDraft; unmatched?: string[] }

export default function RecipeBuilder() {
  const { t, lang, num } = useT();
  const { id = 'new' } = useParams();
  const nav = useNavigate();
  const loc = useLocation();
  const isNew = id === 'new';
  const recipes = useTable('recipes');
  const allIngs = useTable('recipe_ingredients');
  const { map } = useFoods();
  const fav = useFav('recipe');
  const existing = recipes.find((r) => r.id === id);
  const state = loc.state as BuilderState | null;

  const [draft, setDraft] = useState<RecipeDraft | null>(null);
  const [dirty, setDirty] = useState(false);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<Food | null>(null);
  const [editing, setEditing] = useState<DraftIng | null>(null);
  const [diary, setDiary] = useState(false);
  const [errors, setErrors] = useState<{ name?: string; portions?: string; ings?: string }>({});
  const [eatDate, setEatDate] = useState(today());
  const [eatMeal, setEatMeal] = useState<Meal>('dinner');
  const [eatPortions, setEatPortions] = useState<number | null>(1);

  // Load the stored recipe (or a blank / AI-prefilled draft) once per recipe id.
  useEffect(() => {
    if (loadedId === id) return;
    if (isNew) {
      setDraft(state?.draft ?? { name: '', portions: 2, notes: '', ings: [] });
      setDirty(!!state?.draft); setLoadedId(id);
    } else if (existing) {
      setDraft({
        name: existing.name, portions: existing.portions, notes: existing.notes,
        ings: allIngs.filter((i) => i.recipe_id === id).sort((a, b) => a.position - b.position)
          .map((i) => ({ id: i.id, food_id: i.food_id, label: i.label, amount: i.amount, unit: i.unit, grams: i.grams })),
      });
      setDirty(false); setLoadedId(id);
    }
  }, [id, isNew, existing, allIngs, loadedId, state]);

  const calc = useMemo(() => recipeCalc(draft?.portions ?? 1, draft?.ings ?? [], map), [draft, map]);
  if (!draft) return <div className="page"><PageHead title={t('rec.not_found')} back="/recipes" /></div>;

  const update = (patch: Partial<RecipeDraft>) => { setDraft({ ...draft, ...patch }); setDirty(true); setErrors({}); };
  const states = new Set(calc.rows.map((r) => r.food?.state).filter((s) => s === 'raw' || s === 'cooked'));
  const missingRows = calc.rows.filter((r) => r.food && NUTRIENTS.some((k) => r.food![k] == null));

  const saveRecipe = (): string | null => {
    const e: typeof errors = {};
    if (!draft.name.trim()) e.name = t('v.name');
    if (!draft.portions || draft.portions <= 0) e.portions = t('rec.v.portions');
    if (!draft.ings.length) e.ings = t('rec.v.ings');
    setErrors(e);
    if (Object.keys(e).length) return null;
    const rid = isNew ? newId() : id;
    save('recipes', { id: rid, name: draft.name.trim(), portions: draft.portions as number, notes: draft.notes.trim() });
    const keep = new Set(draft.ings.map((i) => i.id));
    allIngs.filter((i) => i.recipe_id === rid && !keep.has(i.id)).forEach((i) => remove('recipe_ingredients', i.id));
    draft.ings.forEach((g, i) => save('recipe_ingredients', { id: g.id, recipe_id: rid, food_id: g.food_id, label: g.label, amount: g.amount, unit: g.unit, grams: g.grams, position: i }));
    setDirty(false);
    toast(t('rec.saved'));
    if (isNew) { setLoadedId(rid); nav(`/recipes/${rid}`, { replace: true }); }
    return rid;
  };
  const del = async () => {
    if (!existing || !(await confirmDialog(t('rec.delete_q', { name: existing.name })))) return;
    allIngs.filter((i) => i.recipe_id === existing.id).forEach((i) => remove('recipe_ingredients', i.id));
    remove('recipes', existing.id);
    nav('/recipes', { replace: true });
  };
  const addToDiary = () => {
    if (!eatPortions || eatPortions <= 0) return;
    const rid = dirty || isNew ? saveRecipe() : id;
    if (!rid) { setDiary(false); return; }
    save('food_entries', {
      date: eatDate, meal: eatMeal, food_id: null, recipe_id: rid, label: draft.name.trim(), amount: eatPortions, unit: 'portion',
      grams: calc.grams / (draft.portions || 1) * eatPortions, estimated: calc.estimated || calc.total.missing.length > 0 || calc.unknown > 0,
      ...scale(totalsToNutrients(calc.perPortion), eatPortions),
    });
    setDiary(false);
    toast(t('nut.added'));
  };

  return (
    <div className="page">
      <PageHead title={isNew ? t('rec.create') : t('rec.edit')} back="/recipes">
        {!isNew && existing && (
          <>
            <IconBtn label={t('c.favorite')} className={fav.has(existing.id) ? 'on' : ''} onClick={() => fav.toggle(existing.id)}><Star size={20} /></IconBtn>
            <IconBtn label={t('c.duplicate')} onClick={() => { const c = duplicateRecipe(existing, t('c.copy_suffix')); toast(t('rec.duplicated')); nav(`/recipes/${c.id}`); }}><Copy size={20} /></IconBtn>
            <IconBtn label={t('c.delete')} onClick={del}><Trash2 size={20} /></IconBtn>
          </>
        )}
      </PageHead>

      <div className="builder">
        <div className="stack">
          <Card>
            <div className="stack">
              <Field label={t('rec.name')} error={errors.name}><TextInput value={draft.name} onChange={(e) => update({ name: e.target.value })} placeholder={t('rec.name_ph')} /></Field>
              <div className="grid2">
                <Field label={t('rec.portions')} error={errors.portions}><NumInput value={draft.portions} onChange={(v) => update({ portions: v })} max={100} /></Field>
                <Field label={t('rec.total_weight')}><TextInput value={`${num(calc.grams)} g`} readOnly tabIndex={-1} /></Field>
              </div>
              <Field label={t('c.notes')}><textarea className="input" rows={2} value={draft.notes} onChange={(e) => update({ notes: e.target.value })} /></Field>
            </div>
          </Card>

          <Card title={t('rec.ingredients')} action={<Btn variant="primary" small onClick={() => setSearching(true)}><Plus size={16} />{t('rec.add_ing')}</Btn>}>
            {state?.unmatched?.length ? <p className="warn-box"><AlertTriangle size={16} /> {t('rec.unmatched', { list: state.unmatched.join(', ') })}</p> : null}
            {!draft.ings.length && <Empty icon={<Utensils size={28} />} title={t('rec.no_ings')} text={t('rec.no_ings_hint')} />}
            {errors.ings && <p className="field-error">{errors.ings}</p>}
            <ul className="list ing-list">
              {calc.rows.map((row) => {
                const share = calc.total.kcal > 0 && row.n.kcal != null ? row.n.kcal / calc.total.kcal : 0;
                return (
                  <li key={row.ing.id} className="item ing">
                    <button type="button" className="item-main" onClick={() => row.food && setEditing(row.ing)}>
                      <span className="item-title">{row.food ? foodLabel(row.food, lang) : row.ing.label} {row.food && <StateBadge state={row.food.state} />}{row.estimated && <span className="badge warn">≈</span>}</span>
                      <span className="muted small">
                        {num(row.ing.amount, 1)} {t(`unit.${row.ing.unit}`)}{row.ing.unit !== 'g' ? ` (≈ ${num(row.ing.grams)} g)` : ''} · {row.food ? `${row.n.kcal == null ? '–' : num(row.n.kcal)} kcal · ${t('n.p')} ${row.n.protein == null ? '–' : num(row.n.protein, 1)} · ${t('n.c')} ${row.n.carbs == null ? '–' : num(row.n.carbs, 1)} · ${t('n.f')} ${row.n.fat == null ? '–' : num(row.n.fat, 1)} g` : t('rec.food_gone')}
                      </span>
                      <span className="sharebar" aria-hidden="true"><i style={{ width: `${share * 100}%` }} /></span>
                    </button>
                    <IconBtn label={t('c.delete')} onClick={() => update({ ings: draft.ings.filter((x) => x.id !== row.ing.id) })}><Trash2 size={16} /></IconBtn>
                  </li>
                );
              })}
            </ul>
            {states.size === 2 && <p className="hint-box">{t('rec.mixed_states')}</p>}
          </Card>
        </div>

        <div className="stack builder-side">
          <Card title={t('rec.per_portion')} className="accent">
            <div className="recipe-kpis big">
              <div><b>{calc.total.missing.includes('kcal') ? '≥ ' : ''}{num(calc.perPortion.kcal)}</b><span className="muted small">kcal</span></div>
              {(['protein', 'carbs', 'fat', 'fiber'] as const).map((k) => (
                <div key={k}><b>{calc.total.missing.includes(k) ? '≥ ' : ''}{num(calc.perPortion[k], 1)} g</b><span className="muted small">{t(`n.${k}`)}</span></div>
              ))}
            </div>
            <p className="muted small">{t('rec.portion_weight', { g: num(calc.grams / (draft.portions || 1)) })}</p>
          </Card>
          <Card title={t('rec.total')}>
            <NutrientLine n={calc.total} missing={calc.total.missing} />
          </Card>
          {(missingRows.length > 0 || calc.unknown > 0 || calc.estimated) && (
            <Card title={t('rec.accuracy')}>
              <ul className="plain small">
                {calc.estimated && <li>≈ {t('rec.note_estimated')}</li>}
                {missingRows.map((r) => (
                  <li key={r.ing.id}>{t('rec.note_missing', { name: foodLabel(r.food!, lang), list: NUTRIENTS.filter((k) => r.food![k] == null).map((k) => t(`n.${k}`)).join(', ') })}</li>
                ))}
                {calc.unknown > 0 && <li>{t('rec.note_unknown', { n: calc.unknown })}</li>}
              </ul>
            </Card>
          )}
          <p className="muted small">{t('food.ref_note')}</p>
          <div className="sticky-actions">
            <div className="sticky-sum">
              <b>{calc.total.missing.includes('kcal') ? '≥ ' : ''}{num(calc.perPortion.kcal)} kcal</b>
              <span className="muted small">{t('rec.per_portion')}</span>
            </div>
            <Btn onClick={() => setDiary(true)} disabled={!draft.ings.length} aria-label={t('rec.to_diary')}><Utensils size={18} /><span className="hide-sm">{t('rec.to_diary')}</span></Btn>
            <Btn variant="primary" onClick={saveRecipe} disabled={!dirty && !isNew}>{dirty || isNew ? t('rec.save') : t('c.saved')}</Btn>
          </div>
        </div>
      </div>

      <Sheet open={searching && !picked} onClose={() => setSearching(false)} title={t('rec.add_ing')}><FoodSearch onPick={setPicked} /></Sheet>
      <AmountSheet key={picked?.id ?? 'p'} food={searching ? picked : null} onClose={() => setPicked(null)}
        onConfirm={(r) => {
          if (!picked) return;
          update({ ings: [...draft.ings, { id: newId(), food_id: picked.id, label: foodLabel(picked, lang), amount: r.amount, unit: r.unit, grams: r.grams }] });
          setPicked(null);
          setSearching(false);
        }} />
      <AmountSheet key={`e-${editing?.id ?? 'e'}`} food={editing ? map.get(editing.food_id) ?? null : null} confirmLabel={t('c.save')}
        initial={editing ? { amount: editing.amount, unit: editing.unit } : undefined} onClose={() => setEditing(null)}
        onConfirm={(r) => { if (editing) update({ ings: draft.ings.map((x) => (x.id === editing.id ? { ...x, amount: r.amount, unit: r.unit, grams: r.grams } : x)) }); setEditing(null); }} />

      <Sheet open={diary} onClose={() => setDiary(false)} title={t('rec.to_diary')}
        footer={<Btn variant="primary" block onClick={addToDiary} disabled={!eatPortions || eatPortions <= 0}>{t('c.add')}</Btn>}>
        <div className="stack">
          <Field label={t('nut.portions_eaten')} hint={t('nut.portions_hint', { n: draft.portions ?? 1 })}><NumInput value={eatPortions} onChange={setEatPortions} max={50} /></Field>
          <div className="grid2">
            <Field label={t('c.date')}><TextInput type="date" value={eatDate} max={today()} onChange={(e) => e.target.value && setEatDate(e.target.value)} /></Field>
            <Field label={t('nut.meal')}>
              <select className="input" value={eatMeal} onChange={(e) => setEatMeal(e.target.value as Meal)}>{MEALS.map((m) => <option key={m} value={m}>{t(`meal.${m}`)}</option>)}</select>
            </Field>
          </div>
          <div className="preview"><NutrientLine n={scale(totalsToNutrients(calc.perPortion), eatPortions ?? 0)} missing={calc.total.missing} approx={calc.estimated} /></div>
          {(dirty || isNew) && <p className="muted small">{t('rec.diary_saves')}</p>}
        </div>
      </Sheet>
    </div>
  );
}
