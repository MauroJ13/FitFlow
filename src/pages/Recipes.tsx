import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChefHat, Copy, Plus, Search, Star } from 'lucide-react';
import type { Recipe } from '../types';
import { useT } from '../i18n';
import { getTable, save, useTable } from '../lib/db';
import { norm, useFav, useFoods } from '../lib/hooks';
import { recipeCalc } from '../lib/nutrition';
import { Empty, IconBtn, PageHead, Seg, cx, toast } from '../components/ui';

export function duplicateRecipe(r: Recipe, suffix: string): Recipe {
  const copy = save('recipes', { name: `${r.name} ${suffix}`, portions: r.portions, notes: r.notes });
  getTable('recipe_ingredients').filter((i) => i.recipe_id === r.id)
    .forEach((i) => save('recipe_ingredients', { recipe_id: copy.id, food_id: i.food_id, label: i.label, amount: i.amount, unit: i.unit, grams: i.grams, position: i.position }));
  return copy;
}

export default function Recipes() {
  const { t, num } = useT();
  const nav = useNavigate();
  const recipes = useTable('recipes');
  const ings = useTable('recipe_ingredients');
  const { map } = useFoods();
  const fav = useFav('recipe');
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<'all' | 'fav'>('all');

  const list = recipes
    .filter((r) => (tab === 'fav' ? fav.has(r.id) : true) && (!q || norm(r.name).includes(norm(q))))
    .sort((a, b) => Number(fav.has(b.id)) - Number(fav.has(a.id)) || b.updated_at.localeCompare(a.updated_at));

  return (
    <div className="page">
      <PageHead title={t('nav.recipes')} sub={t('rec.sub')} back="/nutrition">
        <Link className="btn primary" to="/recipes/new"><Plus size={18} />{t('rec.create')}</Link>
      </PageHead>
      {recipes.length > 0 && (
        <div className="toolbar">
          <div className="searchbar grow"><Search size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('rec.search_ph')} /></div>
          <Seg value={tab} onChange={setTab} options={[{ v: 'all', l: t('c.all') }, { v: 'fav', l: t('c.favorites') }]} />
        </div>
      )}
      {!recipes.length && (
        <Empty icon={<ChefHat size={32} />} title={t('rec.none')} text={t('rec.none_hint')}>
          <Link className="btn primary" to="/recipes/new">{t('rec.create')}</Link>
        </Empty>
      )}
      <div className="card-grid">
        {list.map((r) => {
          const mine = ings.filter((i) => i.recipe_id === r.id);
          const c = recipeCalc(r.portions, mine, map);
          return (
            <article key={r.id} className="card recipe-card" onClick={() => nav(`/recipes/${r.id}`)}>
              <header className="card-head">
                <h3 className="card-title">{r.name}</h3>
                <div className="row" onClick={(e) => e.stopPropagation()}>
                  <IconBtn label={t('c.duplicate')} onClick={() => { const copy = duplicateRecipe(r, t('c.copy_suffix')); toast(t('rec.duplicated')); nav(`/recipes/${copy.id}`); }}><Copy size={17} /></IconBtn>
                  <IconBtn label={t('c.favorite')} className={cx(fav.has(r.id) && 'on')} onClick={() => fav.toggle(r.id)}><Star size={18} /></IconBtn>
                </div>
              </header>
              <p className="muted small">{t('rec.meta', { n: mine.length, p: num(r.portions, 1) })}</p>
              <div className="recipe-kpis">
                <div><b>{c.total.missing.includes('kcal') ? '≥ ' : ''}{num(c.perPortion.kcal)}</b><span className="muted small">kcal</span></div>
                <div><b>{num(c.perPortion.protein, 1)} g</b><span className="muted small">{t('n.protein')}</span></div>
                <div><b>{num(c.perPortion.carbs, 1)} g</b><span className="muted small">{t('n.carbs')}</span></div>
                <div><b>{num(c.perPortion.fat, 1)} g</b><span className="muted small">{t('n.fat')}</span></div>
              </div>
              <p className="muted small">{t('rec.per_portion')}{c.estimated || c.total.missing.length ? ` · ${t('rec.approx')}` : ''}</p>
            </article>
          );
        })}
      </div>
    </div>
  );
}
