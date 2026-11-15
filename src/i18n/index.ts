import { useMemo, useSyncExternalStore } from 'react';
import type { I18nText, Lang } from '../types';
import { fromKey } from '../lib/date';
import en from './en';
import de from './de';
import hr from './hr';

export const LANGS: { id: Lang; label: string }[] = [
  { id: 'de', label: 'Deutsch' },
  { id: 'en', label: 'English' },
  { id: 'hr', label: 'Hrvatski' },
];
const DICTS: Record<Lang, Record<string, string>> = { en, de, hr };
const LOCALES: Record<Lang, string> = { en: 'en-GB', de: 'de-DE', hr: 'hr-HR' };

function detect(): Lang {
  const stored = localStorage.getItem('ff_lang');
  if (stored === 'en' || stored === 'de' || stored === 'hr') return stored;
  return 'en'; // English is the default; the choice is stored per device and in the user's preferences
}

let current: Lang = detect();
document.documentElement.lang = current;
const subs = new Set<() => void>();

export const getLang = () => current;
export function setLang(lang: Lang) {
  if (lang === current) return;
  current = lang;
  localStorage.setItem('ff_lang', lang);
  document.documentElement.lang = lang;
  subs.forEach((f) => f());
}

export type Vars = Record<string, string | number>;
export function translate(key: string, vars?: Vars, lang: Lang = current): string {
  const oneKey = vars?.n === 1 ? `${key}_one` : '';
  let s = (oneKey && (DICTS[lang][oneKey] ?? en[oneKey])) || DICTS[lang][key] || en[key] || key;
  if (vars) s = s.replace(/\{(\w+)\}/g, (_m, k: string) => String(vars[k] ?? ''));
  return s;
}
export const hasKey = (key: string) => key in en;

export function useT() {
  const lang = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, getLang);
  return useMemo(() => {
    const locale = LOCALES[lang];
    return {
      lang,
      locale,
      t: (key: string, vars?: Vars) => translate(key, vars, lang),
      /** Number with at most `digits` decimals in the user's locale. */
      num: (n: number, digits = 0) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n),
      /** Format a YYYY-MM-DD key. */
      date: (key: string, opts: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }) =>
        new Intl.DateTimeFormat(locale, opts).format(fromKey(key)),
      /** Pick the text for the current language from a multilingual value. */
      pick: (text: I18nText | null | undefined, fallback = '') => text?.[lang] ?? text?.en ?? fallback,
    };
  }, [lang]);
}
