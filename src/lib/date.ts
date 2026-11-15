/** Dates are handled as local 'YYYY-MM-DD' keys so a day never shifts with time zones. */
export const pad = (n: number) => String(n).padStart(2, '0');
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const today = () => toKey(new Date());
export const fromKey = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k: string, n: number) => { const d = fromKey(k); d.setDate(d.getDate() + n); return toKey(d); };
export const diffDays = (a: string, b: string) => Math.round((fromKey(b).getTime() - fromKey(a).getTime()) / 86_400_000);
/** Monday of the week that contains k. */
export const weekStart = (k: string) => addDays(k, -((fromKey(k).getDay() + 6) % 7));
/** 0 = Monday … 6 = Sunday. */
export const weekdayIndex = (k: string) => (fromKey(k).getDay() + 6) % 7;
export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let k = from; k <= to && out.length < 800; k = addDays(k, 1)) out.push(k);
  return out;
}
/** Full weeks (Monday first) covering the given month. month: 0-11. */
export function monthGrid(year: number, month: number): string[] {
  const first = toKey(new Date(year, month, 1));
  const last = toKey(new Date(year, month + 1, 0));
  return rangeDays(weekStart(first), addDays(weekStart(last), 6));
}
export const nowTime = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const hhmmToMin = (s: string) => { const [h, m] = s.split(':').map(Number); return (h || 0) * 60 + (m || 0); };
/** Minutes between bedtime and wake-up time, crossing midnight if needed. */
export function sleepMinutes(bed: string, wake: string): number {
  let d = hhmmToMin(wake) - hhmmToMin(bed);
  if (d <= 0) d += 1440;
  return d;
}
export const fmtDuration = (min: number) => `${Math.floor(min / 60)} h ${pad(Math.round(min % 60))} min`;
/** Bedtime as minutes on an axis that does not wrap at midnight (noon = 0 … next noon = 1440). */
export const bedAxis = (hhmm: string) => { const m = hhmmToMin(hhmm); return m < 720 ? m + 720 : m - 720; };
export const axisToClock = (axis: number) => { const m = Math.round(axis + 720) % 1440; return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; };
export const fmtClock = (sec: number) => `${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
