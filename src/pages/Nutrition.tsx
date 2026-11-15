import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChefHat, Copy, Plus, Star, Trash2 } from 'lucide-react';
import type { Food, FoodEntry, Meal, Recipe } from '../types';
import { useT } from '../i18n';
import { MEALS } from '../data';
import { remove, save, useTable } from '../lib/db';
import { today } from '../lib/date';
import { foodLabel, useFav, useFoods } from '../lib/hooks';
import { macroSplit, nutrientsFor, recipeCalc, scale, sumNutrients, totalsToNutrients } from '../lib/nutrition';
import { AmountSheet, FoodSearch, NutrientLine } from '../components/Food';
import { AiCard } from '../components/AiCard';
import { Btn, Card, DateNav, Empty, Field, IconBtn, NumInput, PageHead, Seg, Sheet, toast } from '../components/ui';

export default function Nutrition() {
  const { t, lang, num } = useT();
  const loc = useLocation();
  const [date, setDate] = useState<string>((loc.state as { date?: string } | null)?.date ?? today());
  const entries = useTable('food_entries');
  const recipes = useTable('recipes');
  const allIngs = useTable('recipe_ingredients');
  const { map } = useFoods();
  const favRecipes = useFav('recipe');

  const [adding, setAdding] = useState<Meal | null>(null);
  const [tab, setTab] = useState<'foods' | 'recipes'>('foods');
  const [food, setFood] = useState<Food | null>(null);
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [portions, setPortions] = useState<number | null>(1);
  const [edit, setEdit] = useState<FoodEntry | null>(null);

  const dayEntries = useMemo(() => entries.filter((e) => e.date === date).sort((a, b) => a.created_at.localeCompare(b.created_at)), [entries, date]);
  const totals = sumNutrients(dayEntries);
  const hour = new Date().getHours();
  const nextMeal: Meal = hour < 10 ? 'breakfast' : hour < 14 ? 'lunch' : hour < 17 ? 'snack' : 'dinner';
  const split = macroSplit(totals);

  const calcRecipe = (r: Recipe) => recipeCalc(r.portions, allIngs.filter((i) => i.recipe_id === r.id), map);
  const recipeEntry = (r: Recipe, count: number) => {
    const c = calcRecipe(r);
    return {
      food_id: null, recipe_id: r.id, label: r.name, amount: count, unit: 'portion' as const, grams: c.grams / (r.portions || 1) * count,
      // household units or ingredients with unknown values make the entry an approximation
      estimated: c.estimated || c.total.missing.length > 0 || c.unknown > 0, ...scale(totalsToNutrients(c.perPortion), count),
    };
  };

  const copyPrevious = (meal: Meal) => {
    const prev = entries.filter((e) => e.meal === meal && e.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
    if (!prev) return toast(t('nut.nothing_to_copy'), 'error');
    entries.filter((e) => e.meal === meal && e.date === prev.date).forEach(({ id, created_at, updated_at, _dirty, deleted, ...e }) => save('food_entries', { ...e, date }));
    toast(t('nut.copied'));
  };
  const mealAsRecipe = (meal: Meal) => {
    const list = dayEntries.filter((e) => e.meal === meal && e.food_id && e.grams && e.unit !== 'portion');
    if (!list.length) return toast(t('nut.meal_recipe_none'), 'error');
    const r = save('recipes', { name: `${t(`meal.${meal}`)} ${date}`, portions: 1, notes: '' });
    list.forEach((e, i) => save('recipe_ingredients', { recipe_id: r.id, food_id: e.food_id as string, label: e.label, amount: e.amount, unit: e.unit as Exclude<FoodEntry['unit'], 'portion'>, grams: e.grams as number, position: i }));
    favRecipes.toggle(r.id);
    toast(t('nut.meal_recipe_saved'));
  };

  const editFood = edit?.food_id ? map.get(edit.food_id) : undefined;
  const editRecipe = edit?.recipe_id ? recipes.find((r) => r.id === edit.recipe_id) : undefined;
  const sortedRecipes = [...recipes].sort((a, b) => Number(favRecipes.has(b.id)) - Number(favRecipes.has(a.id)) || a.name.localeCompare(b.name));

  return (
    <div className="page">
      <PageHead title={t('nav.nutrition')}>
        <Link className="btn soft" to="/recipes"><ChefHat size={18} />{t('nav.recipes')}</Link>
      </PageHead>
      <DateNav date={date} onChange={setDate} />

      <Card className="nut-summary">
        <div className="row between">
          <div><span className="big-num">{totals.missing.includes('kcal') ? '≥ ' : ''}{num(totals.kcal)}</span> <span className="muted">kcal</span></div>
          <span className="muted small">{t('nut.logged')}</span>
        </div>
        <div className="macrobar" aria-hidden="true">
          <i className="p" style={{ width: `${split.protein * 100}%` }} /><i className="c" style={{ width: `${split.carbs * 100}%` }} /><i className="f" style={{ width: `${split.fat * 100}%` }} />
        </div>
        <div className="macros">
          {(['protein', 'carbs', 'fat', 'fiber'] as const).map((k) => (
            <div key={k} className={`macro ${k}`}><span className="muted small">{t(`n.${k}`)}</span><b>{totals.missing.includes(k) ? '≥ ' : ''}{num(totals[k], 1)} g</b></div>
          ))}
        </div>
        {totals.missing.length > 0 && <p className="warn-box">{t('nut.incomplete')}</p>}
        <p className="muted small">{t('nut.no_targets')}</p>
      </Card>

      <div className="meal-grid">
        {MEALS.map((meal) => {
          const list = dayEntries.filter((e) => e.meal === meal);
          const sum = sumNutrients(list);
          return (
            <Card key={meal} title={t(`meal.${meal}`)}
              action={<div className="row">
                {list.length > 0 && <IconBtn label={t('nut.meal_recipe')} onClick={() => mealAsRecipe(meal)}><Star size={18} /></IconBtn>}
                <IconBtn label={t('nut.copy_prev')} onClick={() => copyPrevious(meal)}><Copy size={18} /></IconBtn>
                <Btn variant="primary" small onClick={() => { setAdding(meal); setTab('foods'); }}><Plus size={16} />{t('c.add')}</Btn>
              </div>}>
              {list.length ? (
                <>
                  <ul className="list">
                    {list.map((e) => (
                      <li key={e.id} className="item">
                        <button type="button" className="item-main" onClick={() => { setEdit(e); setPortions(e.amount); }}>
                          <span className="item-title">{e.label}{e.estimated && <span className="badge warn">≈</span>}</span>
                          <span className="muted small">
                            {e.unit === 'portion' ? (e.amount === 1 ? t('nut.portions_n_one') : t('nut.portions_n', { n: num(e.amount, 2) })) : `${num(e.amount, 1)} ${t(`unit.${e.unit}`)}`} · {e.kcal == null ? '– ' : num(e.kcal)} kcal · {t('n.p')} {e.protein == null ? '–' : num(e.protein, 1)} g
                          </span>
                        </button>
                        <IconBtn label={t('c.delete')} onClick={() => remove('food_entries', e.id)}><Trash2 size={16} /></IconBtn>
                      </li>
                    ))}
                  </ul>
                  <div className="meal-sum"><NutrientLine n={sum} missing={sum.missing} /></div>
                </>
              ) : <p className="muted small">{t('nut.empty_meal')}</p>}
            </Card>
          );
        })}
      </div>

      {date === today() && (
        <AiCard task="meal" title={t('ai.meal_title')} cacheKey={`meal_${date}_${nextMeal}`} extra={{ meal: t(`meal.${nextMeal}`, undefined) }} actionLabel={t('ai.meal_action')} />
      )}

      {/* add: choose a food or a recipe */}
      <Sheet open={!!adding && !food && !recipe} onClose={() => setAdding(null)} title={adding ? `${t('c.add')}: ${t(`meal.${adding}`)}` : ''}>
        <div className="stack">
          <Seg value={tab} onChange={setTab} options={[{ v: 'foods', l: t('nut.foods') }, { v: 'recipes', l: t('nav.recipes') }]} />
          {tab === 'foods' ? <FoodSearch onPick={setFood} /> : (
            sortedRecipes.length ? (
              <ul className="list">
                {sortedRecipes.map((r) => {
                  const c = calcRecipe(r);
                  return (
                    <li key={r.id} className="item">
                      <button type="button" className="item-main" onClick={() => { setRecipe(r); setPortions(1); }}>
                        <span className="item-title">{favRecipes.has(r.id) && <Star size={14} className="filled" />} {r.name}</span>
                        <span className="muted small">{t('rec.per_portion')}: {num(c.perPortion.kcal)} kcal · {t('n.p')} {num(c.perPortion.protein, 1)} g</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <Empty icon={<ChefHat size={28} />} title={t('rec.none')} text={t('rec.none_hint')}><Link className="btn primary" to="/recipes/new">{t('rec.create')}</Link></Empty>
          )}
        </div>
      </Sheet>
      <AmountSheet key={food?.id ?? 'none'} food={adding ? food : null} onClose={() => setFood(null)}
        onConfirm={(r) => {
          if (!food || !adding) return;
          save('food_entries', { date, meal: adding, food_id: food.id, recipe_id: null, label: foodLabel(food, lang), ...r, ...nutrientsFor(food, r.grams) });
          setFood(null); setAdding(null); toast(t('nut.added'));
        }} />
      <Sheet open={!!recipe && !!adding} onClose={() => setRecipe(null)} title={recipe?.name ?? ''}
        footer={<Btn variant="primary" block disabled={!portions || portions <= 0} onClick={() => {
          if (!recipe || !adding || !portions) return;
          save('food_entries', { date, meal: adding, ...recipeEntry(recipe, portions) });
          setRecipe(null); setAdding(null); toast(t('nut.added'));
        }}>{t('c.add')}</Btn>}>
        {recipe && (
          <div className="stack">
            <Field label={t('nut.portions_eaten')} hint={t('nut.portions_hint', { n: recipe.portions })}><NumInput value={portions} onChange={setPortions} max={50} autoFocus /></Field>
            <div className="preview"><NutrientLine n={scale(totalsToNutrients(calcRecipe(recipe).perPortion), portions ?? 0)} missing={calcRecipe(recipe).total.missing} approx={calcRecipe(recipe).estimated} /></div>
          </div>
        )}
      </Sheet>

      {/* edit an existing entry */}
      <AmountSheet key={`edit-${edit?.id ?? 'none'}`} food={edit && editFood ? editFood : null} confirmLabel={t('c.save')}
        initial={edit && edit.unit !== 'portion' ? { amount: edit.amount, unit: edit.unit } : undefined} onClose={() => setEdit(null)}
        onConfirm={(r) => { if (edit && editFood) save('food_entries', { id: edit.id, ...r, ...nutrientsFor(editFood, r.grams) }); setEdit(null); }}>
        <MealPicker value={edit?.meal ?? 'snack'} onChange={(meal) => edit && (save('food_entries', { id: edit.id, meal }), setEdit({ ...edit, meal }))} />
      </AmountSheet>
      <Sheet open={!!edit && !editFood} onClose={() => setEdit(null)} title={edit?.label ?? ''}
        footer={editRecipe ? <Btn variant="primary" block disabled={!portions || portions <= 0} onClick={() => {
          if (edit && editRecipe && portions) save('food_entries', { id: edit.id, ...recipeEntry(editRecipe, portions) });
          setEdit(null);
        }}>{t('c.save')}</Btn> : undefined}>
        {edit && (
          <div className="stack">
            {editRecipe
              ? <Field label={t('nut.portions_eaten')}><NumInput value={portions} onChange={setPortions} max={50} /></Field>
              : <p className="hint-box">{t('nut.source_gone')}</p>}
            <MealPicker value={edit.meal} onChange={(meal) => { save('food_entries', { id: edit.id, meal }); setEdit({ ...edit, meal }); }} />
            <div className="preview"><NutrientLine n={edit} approx={edit.estimated} /></div>
          </div>
        )}
      </Sheet>
    </div>
  );
}

function MealPicker({ value, onChange }: { value: Meal; onChange: (m: Meal) => void }) {
  const { t } = useT();
  return (
    <Field label={t('nut.meal')}>
      <select className="input" value={value} onChange={(e) => onChange(e.target.value as Meal)}>
        {MEALS.map((m) => <option key={m} value={m}>{t(`meal.${m}`)}</option>)}
      </select>
    </Field>
  );
}
