import { useState } from 'react';
import type { Lang } from '../types';
import { LANGS, setLang, useT } from '../i18n';
import { ACTIVITY_TYPES, EQUIPMENT, EXPERIENCE, GOALS } from '../data';
import { DEFAULT_PREFS, savePrefs, saveProfile, useProfile } from '../lib/hooks';
import { askNotificationPermission, notificationsSupported } from '../lib/notify';
import { Btn, Chips, Field, NumInput, Seg, TextInput, Toggle } from '../components/ui';

const STEPS = 5;

/** Personal onboarding. Only the language step is required – everything else can be skipped. */
export default function Onboarding() {
  const { t, lang } = useT();
  const existing = useProfile();
  const [step, setStep] = useState(0);
  const [name, setName] = useState(existing?.display_name ?? '');
  const [age, setAge] = useState<number | null>(existing?.age ?? null);
  const [experience, setExperience] = useState(existing?.experience ?? 'beginner');
  const [frequency, setFrequency] = useState<number | null>(existing?.training_frequency ?? null);
  const [goals, setGoals] = useState<string[]>(existing?.goals ?? []);
  const [activities, setActivities] = useState<string[]>(existing?.activities ?? []);
  const [equipment, setEquipment] = useState<string[]>(existing?.equipment ?? []);
  const [bed, setBed] = useState(existing?.sleep_bedtime ?? '');
  const [wake, setWake] = useState(existing?.sleep_waketime ?? '');
  const [notif, setNotif] = useState({ workout: false, habits: false, sleep: false });
  const [err, setErr] = useState('');
  const toggle = (list: string[], set: (v: string[]) => void) => (v: string) => set(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const finish = () => {
    saveProfile({ display_name: name.trim(), age, experience, training_frequency: frequency, goals, activities, equipment, sleep_bedtime: bed, sleep_waketime: wake, onboarded: true });
    savePrefs({ language: lang, notifications: { ...DEFAULT_PREFS.notifications, ...notif } });
  };
  const next = () => {
    if (step === 1 && age != null && (age < 13 || age > 120)) return setErr(t('ob.v.age'));
    if (step === 1 && frequency != null && frequency > 7) return setErr(t('ob.v.freq'));
    setErr('');
    if (step === STEPS - 1) finish(); else setStep(step + 1);
  };
  const setReminder = async (key: keyof typeof notif, on: boolean) => {
    if (on && !(await askNotificationPermission())) return setErr(t('water.reminder_denied'));
    setNotif({ ...notif, [key]: on });
  };

  return (
    <div className="center-page">
      <div className="auth-card stack">
        <div className="brand big"><span className="brand-mark">F</span>FitFlow</div>
        <div className="steps">{Array.from({ length: STEPS }, (_, i) => <span key={i} className={i <= step ? 'on' : ''} />)}</div>
        {step === 0 && (
          <>
            <h2>{t('ob.welcome')}</h2>
            <p className="muted">{t('ob.intro')}</p>
            <Field group label={t('set.language')}><Seg<Lang> value={lang} onChange={setLang} options={LANGS.map((l) => ({ v: l.id, l: l.label }))} /></Field>
            <Field label={t('pf.name')}><TextInput value={name} onChange={(e) => setName(e.target.value)} autoComplete="given-name" /></Field>
          </>
        )}
        {step === 1 && (
          <>
            <h2>{t('ob.about')}</h2>
            <p className="muted">{t('ob.optional')}</p>
            <Field group label={t('pf.experience')}><Seg value={experience} onChange={setExperience} options={EXPERIENCE.map((e) => ({ v: e, l: t(`exp.${e}`) }))} /></Field>
            <Field label={t('pf.frequency')} hint={t('pf.frequency_hint')}><NumInput value={frequency} onChange={setFrequency} max={7} placeholder="–" /></Field>
            <Field label={t('pf.age')} hint={t('ob.age_hint')} error={err || null}><NumInput value={age} onChange={setAge} max={120} placeholder="–" /></Field>
          </>
        )}
        {step === 2 && (
          <>
            <h2>{t('ob.goals')}</h2>
            <p className="muted">{t('ob.goals_hint')}</p>
            <Chips options={GOALS.map((g) => ({ v: g, l: t(`goal.${g}`) }))} value={goals} onToggle={toggle(goals, setGoals)} />
          </>
        )}
        {step === 3 && (
          <>
            <h2>{t('ob.training')}</h2>
            <div className="field"><span className="field-label">{t('pf.activities')}</span>
              <Chips options={['gym', ...ACTIVITY_TYPES.filter((a) => a !== 'other' && a !== 'movement')].map((a) => ({ v: a, l: a === 'gym' ? t('nav.gym') : t(`act.${a}`) }))} value={activities} onToggle={toggle(activities, setActivities)} />
            </div>
            <div className="field"><span className="field-label">{t('pf.equipment')}</span>
              <Chips options={EQUIPMENT.filter((e) => e !== 'other').map((e) => ({ v: e, l: t(`eq.${e}`) }))} value={equipment} onToggle={toggle(equipment, setEquipment)} />
            </div>
          </>
        )}
        {step === 4 && (
          <>
            <h2>{t('ob.routine')}</h2>
            <p className="muted">{t('ob.optional')}</p>
            <div className="grid2">
              <Field label={t('pf.bedtime')}><TextInput type="time" value={bed} onChange={(e) => setBed(e.target.value)} /></Field>
              <Field label={t('pf.waketime')}><TextInput type="time" value={wake} onChange={(e) => setWake(e.target.value)} /></Field>
            </div>
            {notificationsSupported() && (
              <div className="field"><span className="field-label">{t('set.notifications')}</span>
                <Toggle label={t('set.n_workout')} checked={notif.workout} onChange={(on) => void setReminder('workout', on)} />
                <Toggle label={t('set.n_habits')} checked={notif.habits} onChange={(on) => void setReminder('habits', on)} />
                <Toggle label={t('set.n_sleep')} checked={notif.sleep} onChange={(on) => void setReminder('sleep', on)} />
                <span className="field-hint">{t('set.n_note')}</span>
              </div>
            )}
            {err && <p className="field-error">{err}</p>}
          </>
        )}
        <div className="row">
          {step > 0 && <Btn onClick={() => { setErr(''); setStep(step - 1); }}>{t('c.back')}</Btn>}
          <Btn variant="primary" className="grow" onClick={next}>{step === STEPS - 1 ? t('ob.start') : t('c.continue')}</Btn>
        </div>
        {step > 0 && step < STEPS - 1 && <button type="button" className="textlink" onClick={() => { setErr(''); setStep(step + 1); }}>{t('ob.skip')}</button>}
      </div>
    </div>
  );
}
