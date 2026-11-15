/** Open Food Facts lookup (free, no key). Needs an internet connection; the built-in ingredient list works offline. */
import type { Food } from '../types';

type OffProduct = { code?: string; product_name?: string; brands?: string; nutriments?: Record<string, unknown> };
export type OffFood = Omit<Food, 'id' | 'created_at' | 'updated_at'>;

const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : null;
};

function mapProduct(p: OffProduct): OffFood | null {
  const name = (p.product_name ?? '').trim();
  if (!name) return null;
  const n = p.nutriments ?? {};
  let kcal = num(n['energy-kcal_100g']);
  if (kcal == null && num(n['energy_100g']) != null) kcal = Math.round((num(n['energy_100g']) as number) / 4.184);
  return {
    name, names: null, brand: (p.brands ?? '').split(',')[0].trim() || null, state: 'na',
    kcal, protein: num(n['proteins_100g']), carbs: num(n['carbohydrates_100g']), fat: num(n['fat_100g']), fiber: num(n['fiber_100g']),
    density: null, piece_g: null, source: 'off', barcode: p.code ?? null,
  };
}

const FIELDS = 'code,product_name,brands,nutriments';

export async function searchOpenFoodFacts(query: string, lang: string): Promise<OffFood[]> {
  const q = query.trim();
  if (/^\d{8,14}$/.test(q)) {
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${q}.json?fields=${FIELDS}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const one = json?.product ? mapProduct({ ...json.product, code: q }) : null;
    return one ? [one] : [];
  }
  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=24&lc=${lang}&fields=${FIELDS}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return ((json?.products ?? []) as OffProduct[]).map(mapProduct).filter((f): f is OffFood => !!f);
}
