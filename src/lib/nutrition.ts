/**
 * All nutrition maths lives here (plain application logic – never AI).
 * Unknown values stay `null` and are reported as "missing" instead of being treated as zero silently.
 */
import type { Food, Nutrient, Nutrients, Unit } from '../types';

export const NUTRIENTS: Nutrient[] = ['kcal', 'protein', 'carbs', 'fat', 'fiber'];
const ML_PER_UNIT: Record<string, number> = { ml: 1, tsp: 5, tbsp: 15, cup: 240 };

export function unitsFor(food: Food): Unit[] {
  const units: Unit[] = ['g', 'ml', 'tsp', 'tbsp', 'cup'];
  if (food.piece_g) units.push('piece');
  return units;
}

/**
 * Convert an amount to grams. Only gram input is exact; volume and piece units are
 * approximations (density / average piece weight) and are flagged as estimated.
 */
export function toGrams(food: Food, amount: number, unit: Unit): { grams: number; estimated: boolean } {
  if (unit === 'g') return { grams: amount, estimated: false };
  if (unit === 'piece') return { grams: amount * (food.piece_g ?? 0), estimated: true };
  const ml = amount * ML_PER_UNIT[unit];
  return { grams: ml * (food.density ?? 1), estimated: unit !== 'ml' || !food.density };
}

export function nutrientsFor(food: Nutrients, grams: number): Nutrients {
  const out = {} as Nutrients;
  for (const n of NUTRIENTS) out[n] = food[n] == null ? null : (food[n] as number) * grams / 100;
  return out;
}
export function scale(n: Nutrients, factor: number): Nutrients {
  const out = {} as Nutrients;
  for (const k of NUTRIENTS) out[k] = n[k] == null ? null : (n[k] as number) * factor;
  return out;
}

export interface Totals extends Record<Nutrient, number> {
  /** Nutrients for which at least one item had no value: the total is a minimum, not exact. */
  missing: Nutrient[];
}
export function sumNutrients(items: Nutrients[]): Totals {
  const t: Totals = { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, missing: [] };
  for (const it of items) {
    for (const n of NUTRIENTS) {
      if (it[n] == null) { if (!t.missing.includes(n)) t.missing.push(n); } else t[n] += it[n] as number;
    }
  }
  return t;
}
/** Totals back to nullable nutrients (a value that is incomplete everywhere stays a number: it is a lower bound). */
export const totalsToNutrients = (t: Totals): Nutrients => ({ kcal: t.kcal, protein: t.protein, carbs: t.carbs, fat: t.fat, fiber: t.fiber });

export interface IngredientInput { food_id: string; label: string; amount: number; unit: Unit; grams: number }
export interface RecipeCalc<I extends IngredientInput> {
  rows: { ing: I; food: Food | undefined; n: Nutrients; estimated: boolean }[];
  total: Totals;
  perPortion: Totals;
  grams: number;
  /** Ingredients whose food no longer exists. */
  unknown: number;
  estimated: boolean;
}
export function recipeCalc<I extends IngredientInput>(portions: number, ings: I[], foods: Map<string, Food>): RecipeCalc<I> {
  const empty: Nutrients = { kcal: null, protein: null, carbs: null, fat: null, fiber: null };
  const rows = ings.map((ing) => {
    const food = foods.get(ing.food_id);
    return { ing, food, n: food ? nutrientsFor(food, ing.grams) : empty, estimated: ing.unit !== 'g' && !(ing.unit === 'ml' && !!food?.density) };
  });
  const total = sumNutrients(rows.map((r) => r.n));
  const p = portions > 0 ? portions : 1;
  const perPortion: Totals = { ...total, missing: total.missing };
  for (const n of NUTRIENTS) perPortion[n] = total[n] / p;
  return {
    rows, total, perPortion,
    grams: ings.reduce((s, i) => s + i.grams, 0),
    unknown: rows.filter((r) => !r.food).length,
    estimated: rows.some((r) => r.estimated),
  };
}

/** Share of energy from protein / carbs / fat (4/4/9 kcal per g), 0–1 each. */
export function macroSplit(t: { protein: number; carbs: number; fat: number }) {
  const p = t.protein * 4, c = t.carbs * 4, f = t.fat * 9;
  const sum = p + c + f || 1;
  return { protein: p / sum, carbs: c / sum, fat: f / sum };
}
