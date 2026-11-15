import { norm } from './hooks';

const tokens = (s: string) => norm(s).replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((t) => t.length > 1);

/** Similarity 0–1 between a free-text query and a candidate name. */
export function similarity(query: string, name: string): number {
  const q = tokens(query), n = tokens(name);
  if (!q.length || !n.length) return 0;
  const qs = q.join(' '), ns = n.join(' ');
  if (qs === ns) return 1;
  const common = q.filter((t) => n.some((m) => m === t || (t.length > 3 && (m.startsWith(t) || t.startsWith(m))))).length;
  const jaccard = common / (q.length + n.length - common);
  const contains = ns.includes(qs) || qs.includes(ns) ? 0.75 : 0;
  return Math.max(jaccard, contains);
}

/** Best candidate above the threshold, or null – callers must let the user confirm the match. */
export function bestMatch<C>(query: string, candidates: C[], names: (c: C) => (string | undefined | null)[], threshold = 0.5): { item: C; score: number } | null {
  let best: { item: C; score: number } | null = null;
  for (const c of candidates) {
    for (const name of names(c)) {
      if (!name) continue;
      const score = similarity(query, name);
      if (score >= threshold && (!best || score > best.score)) best = { item: c, score };
    }
  }
  return best;
}
