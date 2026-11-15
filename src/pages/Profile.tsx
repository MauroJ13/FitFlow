import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, LogOut, Trash2 } from 'lucide-react';
import type { AiPrefs, Lang, ShareKey } from '../types';
import { LANGS, setLang, useT } from '../i18n';
import { EQUIPMENT, EXPERIENCE, GENDERS, GOALS } from '../data';
import { setLocalOnly, signOut, unsyncedBeforeSignOut, useAuth } from '../lib/auth';
import { PROVIDER_CREDIT, aiChat, aiEnabled, aiErrorKey } from '../lib/ai';
import { exportAll, wipeLocal } from '../lib/db';
import { today } from '../lib/date';
import { EMPTY_PROFILE, isMinor, savePrefs, saveProfile, usePrefs, useProfile } from '../lib/hooks';
import { supabase } from '../lib/supabase';
import { deleteRemoteData } from '../lib/sync';
import { healthProviders } from '../lib/health';
import { askNotificationPermission, notificationsSupported } from '../lib/notify';
import { MORE_NAV, SyncBadge } from '../components/Layout';
import { Btn, Card, Chips, Field, NumInput, PageHead, Seg, TextInput, Toggle, confirmDialog, toast } from '../components/ui';

const SHARE_KEYS: ShareKey[] = ['profile', 'workouts', 'nutrition', 'sleep', 'hydration', 'activity', 'habits'];

export default function Profile() {
  const { t, lang } = useT();
  const auth = useAuth();
  const prefs = usePrefs();
  const stored = useProfile();
  const p = { ...EMPTY_PROFILE, ...stored };
  const [testing, setTesting] = useState(false);
  const [busy, setBusy] = useState(false);

  const setAi = (patch: Partial<AiPrefs>) => savePrefs({ ai: { ...prefs.ai, ...patch } });
  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const setNotif = async (key: 'workout' | 'habits' | 'sleep' | 'weekly' | 'milestones', on: boolean) => {
    if (on && !(await askNotificationPermission())) return toast(t('water.reminder_denied'), 'error');
    savePrefs({ notifications: { ...prefs.notifications, [key]: on } });
  };
  /** Downscale to 128 px JPEG so the picture stays small enough to sync with the profile row. */
  const pickAvatar = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const bmp = await createImageBitmap(file);
      const size = 128, side = Math.min(bmp.width, bmp.height);
      const canvas = document.createElement('canvas');
      canvas.width = size; canvas.height = size;
      canvas.getContext('2d')!.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, size, size);
      saveProfile({ avatar: canvas.toDataURL('image/jpeg', 0.82) });
    } catch { toast(t('pf.photo_failed'), 'error'); }
  };
  const testAi = async () => {
    setTesting(true);
    try {
      const r = await aiChat([{ role: 'user', content: 'Reply with the single word OK.' }], { temperature: 0 });
      toast(t('set.ai_ok', { model: r.model }));
    } catch (e) {
      toast(t(aiErrorKey(e)), 'error');
    } finally { setTesting(false); }
  };
  const exportData = () => {
    const blob = new Blob([JSON.stringify({ app: 'FitFlow', exported_at: new Date().toISOString(), data: exportAll() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `fitflow-export-${today()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
  const doSignOut = async () => {
    setBusy(true);
    const pending = await unsyncedBeforeSignOut();
    setBusy(false);
    if (pending > 0 && !(await confirmDialog(t('set.signout_pending', { n: pending })))) return;
    if (pending === 0 && !(await confirmDialog(t('set.signout_q'), { ok: t('set.signout'), danger: false }))) return;
    await signOut();
  };
  const deleteData = async () => {
    if (!(await confirmDialog(t('set.delete_data_q')))) return;
    if (auth.user && !navigator.onLine) return toast(t('set.delete_offline'), 'error');
    setBusy(true);
    try {
      if (auth.user) await deleteRemoteData();
      await wipeLocal();
      window.location.reload();
    } catch (e) {
      toast(`${t('set.delete_failed')}: ${e instanceof Error ? e.message : ''}`, 'error');
      setBusy(false);
    }
  };
  const deleteAccount = async () => {
    if (!supabase || !auth.user) return;
    if (!(await confirmDialog(t('set.delete_account_q')))) return;
    setBusy(true);
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) { setBusy(false); return toast(`${t('set.delete_failed')}: ${error.message}`, 'error'); }
    await signOut();
  };

  return (
    <div className="page">
      <PageHead title={t('nav.profile')} />

      <nav className="more-grid always" aria-label={t('home.more')}>
        {MORE_NAV.map((n) => <Link key={n.to} to={n.to} className="more-tile"><n.icon size={22} /><span>{t(n.key)}</span></Link>)}
      </nav>

      <div className="settings-layout">
        <div className="stack side-col">
          <Card title={t('set.account')}>
            <div className="stack">
              {auth.user ? (
                <>
                  <p><b>{auth.user.email}</b></p>
                  <SyncBadge />
                  <Btn onClick={doSignOut} disabled={busy}><LogOut size={18} />{t('set.signout')}</Btn>
                </>
              ) : (
                <>
                  <p className="muted">{auth.configured ? t('set.local_mode') : t('set.local_only_build')}</p>
                  {auth.configured && <Btn variant="primary" onClick={() => setLocalOnly(false)}>{t('set.create_account')}</Btn>}
                </>
              )}
            </div>
          </Card>

          <Card title={t('set.appearance')}>
            <div className="stack">
              <Field group label={t('set.language')}>
                <Seg<Lang> value={lang} onChange={(l) => { setLang(l); savePrefs({ language: l }); }} options={LANGS.map((l) => ({ v: l.id, l: l.label }))} />
              </Field>
              <Field group label={t('set.theme')}>
                <Seg value={prefs.theme} onChange={(theme) => savePrefs({ theme })} options={[{ v: 'dark', l: t('set.dark') }, { v: 'light', l: t('set.light') }]} />
              </Field>
            </div>
          </Card>

          <Card title={t('set.notifications')}>
            {notificationsSupported() ? (
              <>
                <Toggle label={t('set.n_workout')} checked={prefs.notifications.workout} onChange={(on) => void setNotif('workout', on)} />
                {prefs.notifications.workout && <Field label={t('set.n_time')}><TextInput type="time" value={prefs.notifications.workout_time} onChange={(e) => e.target.value && savePrefs({ notifications: { ...prefs.notifications, workout_time: e.target.value } })} /></Field>}
                <Toggle label={t('set.n_habits')} checked={prefs.notifications.habits} onChange={(on) => void setNotif('habits', on)} />
                {prefs.notifications.habits && <Field label={t('set.n_time')}><TextInput type="time" value={prefs.notifications.habits_time} onChange={(e) => e.target.value && savePrefs({ notifications: { ...prefs.notifications, habits_time: e.target.value } })} /></Field>}
                <Toggle label={t('set.n_sleep')} checked={prefs.notifications.sleep} onChange={(on) => void setNotif('sleep', on)} />
                <Toggle label={t('set.n_weekly')} checked={prefs.notifications.weekly} onChange={(on) => void setNotif('weekly', on)} />
                <Toggle label={t('set.n_milestones')} checked={prefs.notifications.milestones} onChange={(on) => void setNotif('milestones', on)} />
                <p className="muted small">{t('set.n_note')}</p>
              </>
            ) : <p className="muted">{t('set.n_unsupported')}</p>}
          </Card>

          <Card title={t('set.services')}>
            <ul className="list">
              {healthProviders().map((h) => (
                <li key={h.id} className="item"><div className="item-main static"><span className="item-title">{t(`svc.${h.id}`)}</span><span className="muted small">{t('svc.native_only')}</span></div><span className="badge">{t('svc.not_connected')}</span></li>
              ))}
            </ul>
            <p className="muted small">{t('svc.note')}</p>
          </Card>

          <Card title={t('set.plan')}>
            <p><b>{t('set.plan_free')}</b></p>
            <p className="muted small">{t('set.plan_note')}</p>
          </Card>

          <Card title={t('set.timer')}>
            <Toggle label={t('set.timer_sound')} checked={prefs.timer.sound} onChange={(sound) => savePrefs({ timer: { ...prefs.timer, sound } })} />
            <Toggle label={t('set.timer_vibrate')} checked={prefs.timer.vibrate} onChange={(vibrate) => savePrefs({ timer: { ...prefs.timer, vibrate } })} />
            <p className="muted small">{t('set.timer_note')}</p>
            <p className="muted small"><Link to="/hydration" className="textlink">{t('set.notifications_link')}</Link></p>
          </Card>

          <Card title={t('set.data')}>
            <div className="stack">
              <p className="muted small">{t('set.privacy')}</p>
              <Btn onClick={exportData}><Download size={18} />{t('set.export')}</Btn>
              <Btn variant="danger" onClick={deleteData} disabled={busy}><Trash2 size={18} />{t('set.delete_data')}</Btn>
              {auth.user && <Btn variant="danger" onClick={deleteAccount} disabled={busy}><Trash2 size={18} />{t('set.delete_account')}</Btn>}
            </div>
          </Card>
        </div>
        <div className="stack main-col">
          <Card title={t('set.personal')}>
            <p className="muted small">{t('set.personal_hint')}</p>
            <div className="row mt">
              {p.avatar ? <img className="avatar big" src={p.avatar} alt="" /> : <span className="avatar big empty">{(p.display_name || 'F').slice(0, 1).toUpperCase()}</span>}
              <label className="btn soft small">{t('pf.photo')}<input type="file" accept="image/*" hidden onChange={(e) => void pickAvatar(e.target.files?.[0])} /></label>
              {p.avatar && <Btn small variant="ghost" onClick={() => saveProfile({ avatar: null })}>{t('c.delete')}</Btn>}
            </div>
            <div className="form-grid">
              <Field label={t('pf.name')}><TextInput value={p.display_name} onChange={(e) => saveProfile({ display_name: e.target.value })} /></Field>
              <Field label={t('pf.age')} hint={t('ob.age_hint')}>
                <NumInput value={p.age} max={120} placeholder="–" onChange={(v) => { if (v == null || (v >= 13 && v <= 120)) saveProfile({ age: v == null ? null : Math.round(v) }); }} />
              </Field>
              <Field label={t('pf.gender')}>
                <select className="input" value={p.gender} onChange={(e) => saveProfile({ gender: e.target.value })}>
                  {GENDERS.map((g) => <option key={g} value={g}>{g ? t(`gender.${g}`) : t('pf.not_specified')}</option>)}
                </select>
              </Field>
              <Field label={t('pf.experience')}>
                <select className="input" value={p.experience} onChange={(e) => saveProfile({ experience: e.target.value })}>
                  {EXPERIENCE.map((x) => <option key={x} value={x}>{t(`exp.${x}`)}</option>)}
                </select>
              </Field>
              <Field label={t('pf.frequency')} hint={t('pf.frequency_hint')}>
                <NumInput value={p.training_frequency} max={7} placeholder="–" onChange={(v) => saveProfile({ training_frequency: v == null ? null : Math.round(v) })} />
              </Field>
              <Field label={t('pf.bedtime')}><TextInput type="time" value={p.sleep_bedtime} onChange={(e) => saveProfile({ sleep_bedtime: e.target.value })} /></Field>
              <Field label={t('pf.waketime')}><TextInput type="time" value={p.sleep_waketime} onChange={(e) => saveProfile({ sleep_waketime: e.target.value })} /></Field>
              <Field label={t('pf.exercise_prefs')}><TextInput value={p.exercise_prefs} placeholder={t('pf.exercise_prefs_ph')} onChange={(e) => saveProfile({ exercise_prefs: e.target.value })} /></Field>
              <Field label={t('pf.dietary')}><TextInput value={p.dietary_prefs} placeholder={t('pf.dietary_ph')} onChange={(e) => saveProfile({ dietary_prefs: e.target.value })} /></Field>
              <Field label={t('pf.allergies')}><TextInput value={p.allergies} onChange={(e) => saveProfile({ allergies: e.target.value })} /></Field>
              <Field label={t('pf.interests')}><TextInput value={p.interests} onChange={(e) => saveProfile({ interests: e.target.value })} /></Field>
            </div>
            <div className="field mt"><span className="field-label">{t('pf.equipment')}</span>
              <Chips options={EQUIPMENT.map((e) => ({ v: e, l: t(`eq.${e}`) }))} value={p.equipment} onToggle={(v) => saveProfile({ equipment: toggleIn(p.equipment, v) })} />
            </div>
            {isMinor(stored) && <p className="hint-box mt">{t('pf.minor_note')}</p>}
          </Card>

          <Card title={t('set.goals')}>
            <p className="muted small">{t('ob.goals_hint')}</p>
            <Chips options={GOALS.map((g) => ({ v: g, l: t(`goal.${g}`) }))} value={p.goals} onToggle={(v) => saveProfile({ goals: toggleIn(p.goals, v) })} />
          </Card>

          <Card title={t('set.ai')}>
            <div className="stack">
              <Toggle label={t('set.ai_enabled')} checked={aiEnabled(prefs)} onChange={(enabled) => setAi({ enabled })} />
              <p className="hint-box">{t('set.ai_how', { provider: PROVIDER_CREDIT })}</p>
              {aiEnabled(prefs) && <Btn onClick={testAi} disabled={testing}>{testing ? t('c.loading') : t('set.ai_test')}</Btn>}
              <Toggle label={t('set.ai_weekly')} checked={prefs.ai.auto_weekly} onChange={(auto_weekly) => setAi({ auto_weekly })} />
              <div className="field"><span className="field-label">{t('set.ai_share')}</span>
                <p className="muted small">{t('set.ai_share_hint')}</p>
                {SHARE_KEYS.map((k) => (
                  <Toggle key={k} label={t(`share.${k}`)} checked={prefs.ai.share[k]} onChange={(on) => setAi({ share: { ...prefs.ai.share, [k]: on } })} />
                ))}
              </div>
            </div>
          </Card>
        </div>
      </div>
      <p className="muted small center">FitFlow 1.0 · {t('set.install_hint')}</p>
    </div>
  );
}
