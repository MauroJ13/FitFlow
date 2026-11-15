import { useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '../i18n';
import { addDays, fromKey, monthGrid, rangeDays, today, weekStart } from '../lib/date';
import { useData } from '../lib/stats';
import { DayDetail } from '../components/DayDetail';
import { Btn, Card, IconBtn, PageHead, cx } from '../components/ui';
import { DOTS } from './Home';

export default function CalendarPage() {
  const { t, locale, date: fmt } = useT();
  const data = useData();
  const now = today();
  const [ym, setYm] = useState(() => ({ y: fromKey(now).getFullYear(), m: fromKey(now).getMonth() }));
  const [selected, setSelected] = useState(now);
  const detailRef = useRef<HTMLDivElement>(null);

  const grid = monthGrid(ym.y, ym.m);
  const shift = (n: number) => { const d = new Date(ym.y, ym.m + n, 1); setYm({ y: d.getFullYear(), m: d.getMonth() }); };
  const title = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(new Date(ym.y, ym.m, 1));
  const weekdays = rangeDays(grid[0], grid[6]).map((k) => fmt(k, { weekday: 'short' }));
  const week = rangeDays(weekStart(selected), addDays(weekStart(selected), 6));
  const count = (kind: (typeof DOTS)[number]) => week.filter((k) => data.day(k).has[kind]).length;
  const monthDays = grid.filter((k) => fromKey(k).getMonth() === ym.m && k <= now).reverse().filter((k) => Object.values(data.day(k).has).some(Boolean));

  const select = (k: string) => {
    setSelected(k);
    const d = fromKey(k);
    if (d.getMonth() !== ym.m) setYm({ y: d.getFullYear(), m: d.getMonth() });
    if (window.matchMedia('(max-width: 959px)').matches) setTimeout(() => detailRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };

  return (
    <div className="page">
      <PageHead title={t('nav.calendar')} />
      <div className="cal-layout">
        <div className="stack">
          <Card>
            <div className="cal-head">
              <IconBtn label={t('cal.prev_month')} onClick={() => shift(-1)}><ChevronLeft size={22} /></IconBtn>
              <h2>{title}</h2>
              <IconBtn label={t('cal.next_month')} onClick={() => shift(1)}><ChevronRight size={22} /></IconBtn>
              <Btn small onClick={() => { setYm({ y: fromKey(now).getFullYear(), m: fromKey(now).getMonth() }); setSelected(now); }}>{t('c.today')}</Btn>
            </div>
            <div className="cal-grid" role="grid">
              {weekdays.map((w) => <div key={w} className="cal-wd">{w}</div>)}
              {grid.map((k) => {
                const d = data.day(k);
                const out = fromKey(k).getMonth() !== ym.m;
                return (
                  <button key={k} type="button" role="gridcell" aria-selected={k === selected} aria-label={fmt(k, { day: 'numeric', month: 'long' })}
                    className={cx('cal-day', out && 'out', k === now && 'today', k === selected && 'selected')} onClick={() => select(k)}>
                    <span className="cal-num">{fromKey(k).getDate()}</span>
                    <span className="dots">{DOTS.filter((x) => d.has[x]).map((x) => <i key={x} className={`dot ${x}`} />)}</span>
                  </button>
                );
              })}
            </div>
            <div className="legend">
              {DOTS.map((x) => <span key={x}><i className={`dot ${x}`} />{t(`cal.${x}`)}</span>)}
            </div>
            <p className="muted small">{t('cal.legend_note')}</p>
          </Card>

          <Card title={t('cal.week_overview')}>
            <p className="muted small">{fmt(week[0], { day: 'numeric', month: 'short' })} – {fmt(week[6], { day: 'numeric', month: 'short' })}</p>
            <div className="weekstrip">
              {week.map((k) => {
                const s = data.day(k);
                return (
                  <button type="button" key={k} className={cx('ws-day', k === now && 'today', k === selected && 'selected')} onClick={() => select(k)}>
                    <span className="muted small">{fmt(k, { weekday: 'narrow' })}</span>
                    <span className="ws-num">{fromKey(k).getDate()}</span>
                    <span className="dots">{DOTS.filter((x) => s.has[x]).map((x) => <i key={x} className={`dot ${x}`} />)}</span>
                  </button>
                );
              })}
            </div>
            <div className="legend counts">
              {DOTS.map((x) => <span key={x}><i className={`dot ${x}`} /><span>{t(`cal.${x}`)}: <b>{count(x)}</b>/7</span></span>)}
            </div>
          </Card>

          <Card title={t('cal.history')}>
            {!monthDays.length && <p className="muted">{t('cal.no_history')}</p>}
            <ul className="list">
              {monthDays.map((k) => {
                const d = data.day(k);
                return (
                  <li key={k} className="item">
                    <button type="button" className="item-main" onClick={() => select(k)}>
                      <span className="item-title">{fmt(k, { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                      <span className="muted small">{DOTS.filter((x) => d.has[x]).map((x) => t(`cal.${x}`)).join(' · ')}</span>
                    </button>
                    <span className="dots">{DOTS.filter((x) => d.has[x]).map((x) => <i key={x} className={`dot ${x}`} />)}</span>
                  </li>
                );
              })}
            </ul>
          </Card>
        </div>
        <div ref={detailRef} className="cal-detail">
          <Card><DayDetail key={selected} date={selected} data={data} /></Card>
        </div>
      </div>
    </div>
  );
}
