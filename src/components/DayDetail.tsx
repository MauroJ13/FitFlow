import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Droplets, Dumbbell, Footprints, ListChecks, Moon, Utensils } from 'lucide-react';
import { useT } from '../i18n';
import { MEALS } from '../data';
import { getTable, remove, save } from '../lib/db';
import { fmtDuration } from '../lib/date';
import { usePrefs } from '../lib/hooks';
import type { Data } from '../lib/stats';
import { NutrientLine } from './Food';

/** Everything recorded on one day. "Recorded" and "personal reference reached" are shown separately. */
export function DayDetail({ date, data }: { date: string; data: Data }) {
  const { t, date: fmt, num } = useT();
  const prefs = usePrefs();
  const d = data.day(date);
  const [note, setNote] = useState(d.note);
  useEffect(() => setNote(data.day(date).note), [date]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveNote = () => {
    const existing = getTable('calendar_notes').find((n) => n.date === date);
    if (note.trim() === (existing?.note ?? '')) return;
    if (!note.trim() && existing) remove('calendar_notes', existing.id);
    else if (note.trim()) save('calendar_notes', { ...(existing ? { id: existing.id } : {}), date, note: note.trim() });
  };
  const empty = !d.has.gym && !d.has.nutrition && !d.has.sleep && !d.has.water && !d.has.activity && !d.has.habits;
  const bySet = new Map<string, string[]>();
  d.sets.forEach((s) => bySet.set(s.exercise_name, [...(bySet.get(s.exercise_name) ?? []), `${s.reps}${s.weight ? ` × ${num(s.weight, 1)} kg` : ''}`]));

  return (
    <div className="stack daydetail">
      <h3 className="card-title">{fmt(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</h3>
      {empty && <p className="muted">{t('cal.nothing')}</p>}

      {d.has.gym && (
        <div className="dd-block">
          <h4><Dumbbell size={16} className="c-gym" /> {t('cal.gym')}</h4>
          {d.sessions.map((s) => <p key={s.id}><b>{s.name}</b></p>)}
          <ul className="plain">{[...bySet].map(([name, sets]) => <li key={name}>{name}: <span className="muted">{sets.join(' · ')}</span></li>)}</ul>
          {!d.sets.length && <p className="muted small">{t('cal.no_sets')}</p>}
        </div>
      )}
      {d.has.nutrition && (
        <div className="dd-block">
          <h4><Utensils size={16} className="c-nutrition" /> {t('cal.nutrition')}</h4>
          <NutrientLine n={d.nutrition} missing={d.nutrition.missing} />
          {MEALS.map((m) => {
            const list = d.entries.filter((e) => e.meal === m);
            return list.length ? <p key={m} className="small"><b>{t(`meal.${m}`)}:</b> <span className="muted">{list.map((e) => e.label).join(', ')}</span></p> : null;
          })}
          <p className="muted small">{t('cal.recorded_note')}</p>
        </div>
      )}
      {d.sleep && (
        <div className="dd-block">
          <h4><Moon size={16} className="c-sleep" /> {t('cal.sleep')}</h4>
          <p>{d.sleep.bedtime} – {d.sleep.wake_time} · <b>{fmtDuration(d.sleep.duration_min)}</b>{d.sleep.energy ? ` · ${t('sleep.energy')} ${d.sleep.energy}/5` : ''}</p>
          {d.sleep.notes && <p className="muted small">{d.sleep.notes}</p>}
        </div>
      )}
      {d.has.water && (
        <div className="dd-block">
          <h4><Droplets size={16} className="c-water" /> {t('cal.water')}</h4>
          <p><b>{num(d.waterMl)} ml</b> <span className="muted">· {t('cal.entries', { n: d.water.length })}</span></p>
          {prefs.water_pref_ml != null && d.waterMl >= prefs.water_pref_ml && <p className="small ok-text">{t('cal.pref_reached')}</p>}
        </div>
      )}
      {d.has.activity && (
        <div className="dd-block">
          <h4><Footprints size={16} className="c-activity" /> {t('cal.activity')}</h4>
          <ul className="plain">{d.activities.map((a) => (
            <li key={a.id}>{t(`act.${a.type}`)} · {a.duration_min} min{a.distance_km ? ` · ${num(a.distance_km, 2)} km` : ''}{a.notes ? <span className="muted"> – {a.notes}</span> : null}</li>
          ))}</ul>
        </div>
      )}
      {d.has.habits && (
        <div className="dd-block">
          <h4><ListChecks size={16} className="c-habits" /> {t('cal.habits')}</h4>
          <p>{d.habitLogs.map((l) => data.habits.find((h) => h.id === l.habit_id)?.name).filter(Boolean).join(', ')}</p>
        </div>
      )}
      <label className="field">
        <span className="field-label">{t('cal.note')}</span>
        <textarea className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={saveNote} placeholder={t('cal.note_ph')} />
      </label>
      <div className="row wrap">
        <Link className="btn soft small" to="/nutrition" state={{ date }}>{t('nav.nutrition')}</Link>
        <Link className="btn soft small" to="/sleep" state={{ date }}>{t('nav.sleep')}</Link>
        <Link className="btn soft small" to="/activity" state={{ date }}>{t('nav.activity')}</Link>
      </div>
    </div>
  );
}
