import { useState } from 'react';
import { Droplets, Plus, Trash2 } from 'lucide-react';
import { useT } from '../i18n';
import { remove, save } from '../lib/db';
import { addDays, nowTime, rangeDays, today } from '../lib/date';
import { savePrefs, usePrefs } from '../lib/hooks';
import { askNotificationPermission, notificationsSupported } from '../lib/notify';
import { useData } from '../lib/stats';
import { Bars } from '../components/charts';
import { Btn, Card, DateNav, Field, IconBtn, NumInput, PageHead, Ring, Toggle, toast } from '../components/ui';

export default function Hydration() {
  const { t, date: fmt, num } = useT();
  const data = useData();
  const prefs = usePrefs();
  const [date, setDate] = useState(today());
  const [custom, setCustom] = useState<number | null>(null);
  const [quickText, setQuickText] = useState(prefs.water_quick.join(', '));

  const day = data.day(date);
  const add = (ml: number) => {
    if (!(ml > 0) || ml > 5000) return toast(t('water.v.amount'), 'error');
    save('hydration_records', { date, time: date === today() ? nowTime() : '12:00', amount_ml: Math.round(ml) });
  };
  const chart = rangeDays(addDays(today(), -13), today()).map((k) => ({ label: fmt(k, { day: 'numeric', month: 'numeric' }), ml: data.day(k).has.water ? data.day(k).waterMl : null }));
  const saveQuick = () => {
    const list = quickText.split(/[,; ]+/).map(Number).filter((n) => n > 0 && n <= 2000).slice(0, 5);
    if (!list.length) return toast(t('water.v.quick'), 'error');
    savePrefs({ water_quick: list });
    setQuickText(list.join(', '));
    toast(t('c.saved'));
  };
  const toggleReminder = async (on: boolean) => {
    if (on && !(await askNotificationPermission())) return toast(t('water.reminder_denied'), 'error');
    savePrefs({ notifications: { ...prefs.notifications, water: on } });
  };

  return (
    <div className="page">
      <PageHead title={t('nav.hydration')} sub={t('water.sub')} />
      <DateNav date={date} onChange={setDate} />

      <Card className="water-main">
        <div className="row between">
          {prefs.water_pref_ml
            ? <Ring value={day.waterMl} max={prefs.water_pref_ml} size={120} color="var(--c-water)"><b className="big-num">{num(day.waterMl)}</b><span className="muted small">/ {num(prefs.water_pref_ml)} ml</span></Ring>
            : <div><span className="big-num xl">{num(day.waterMl)}</span> <span className="muted">ml</span></div>}
          <Droplets size={40} className="c-water" />
        </div>
        <div className="quick-grid">
          {prefs.water_quick.map((ml) => <Btn key={ml} className="quick" onClick={() => add(ml)}><Plus size={16} />{ml} ml</Btn>)}
        </div>
        <div className="row">
          <div className="grow"><NumInput value={custom} onChange={setCustom} max={5000} placeholder={t('water.custom_ph')} aria-label={t('water.custom_ph')} /></div>
          <Btn variant="primary" disabled={!custom} onClick={() => { if (custom) { add(custom); setCustom(null); } }}>{t('c.add')}</Btn>
        </div>
      </Card>

      {day.water.length > 0 && (
        <Card title={t('water.entries')}>
          <ul className="list">
            {[...day.water].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((w) => (
              <li key={w.id} className="item">
                <div className="item-main static"><span className="item-title">{num(w.amount_ml)} ml</span><span className="muted small">{w.time}</span></div>
                <IconBtn label={t('c.delete')} onClick={() => remove('hydration_records', w.id)}><Trash2 size={16} /></IconBtn>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card title={t('water.history')}>
        {chart.some((c) => c.ml != null) ? <Bars data={chart} y="ml" name={t('nav.hydration')} unit="ml" color="var(--c-water)" /> : <p className="muted">{t('water.none')}</p>}
      </Card>

      <Card title={t('water.settings')}>
        <div className="stack">
          <Field label={t('water.pref')} hint={t('water.pref_hint')}>
            <NumInput value={prefs.water_pref_ml} max={6000} placeholder="–" onChange={(v) => savePrefs({ water_pref_ml: v && v > 0 ? Math.round(v) : null })} />
          </Field>
          <Field label={t('water.quick')} hint={t('water.quick_hint')}>
            <div className="row"><input className="input grow" value={quickText} onChange={(e) => setQuickText(e.target.value)} inputMode="numeric" /><Btn onClick={saveQuick}>{t('c.save')}</Btn></div>
          </Field>
          {notificationsSupported() && (
            <>
              <Toggle label={t('water.reminder')} checked={prefs.notifications.water} onChange={toggleReminder} />
              {prefs.notifications.water && (
                <Field label={t('water.reminder_every')}>
                  <NumInput value={prefs.notifications.water_every_min} max={480} onChange={(v) => { if (v && v >= 15) savePrefs({ notifications: { ...prefs.notifications, water_every_min: Math.round(v) } }); }} />
                </Field>
              )}
              <p className="muted small">{t('water.reminder_note')}</p>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}
