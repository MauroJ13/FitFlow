import { Suspense, lazy, useEffect } from 'react';
import { HashRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { setLang, useT } from './i18n';
import { useAuth } from './lib/auth';
import { useTable } from './lib/db';
import { getPrefs, getProfile, usePrefs, useProfile } from './lib/hooks';
import { useSyncStatus } from './lib/sync';
import { useData } from './lib/stats';
import { checkAchievements } from './lib/achievements';
import { ensureWeeklyReport } from './lib/report';
import { notify, scheduleWaterReminder, startDailyReminders } from './lib/notify';
import { getData } from './lib/stats';
import { getTable } from './lib/db';
import { hhmmToMin, today, weekdayIndex } from './lib/date';
import { Layout } from './components/Layout';
import { ConfirmHost, Toaster, toast } from './components/ui';
import AuthPage from './pages/Auth';
import Onboarding from './pages/Onboarding';
import Home from './pages/Home';
import Nutrition from './pages/Nutrition';
import Recipes from './pages/Recipes';
import RecipeBuilder from './pages/RecipeBuilder';
import Gym from './pages/Gym';
import PlanEditor from './pages/PlanEditor';
import GymMode from './pages/GymMode';
import CalendarPage from './pages/Calendar';
import Activity from './pages/Activity';
import Habits from './pages/Habits';
import Profile from './pages/Profile';
import Goals from './pages/Goals';

// Heavier screens (charts, PDF/OCR, chat) are loaded on demand to keep the first load fast on mobile.
const Sleep = lazy(() => import('./pages/Sleep'));
const Hydration = lazy(() => import('./pages/Hydration'));
const Progress = lazy(() => import('./pages/Progress'));
const PlanImport = lazy(() => import('./pages/PlanImport'));
const AiPage = lazy(() => import('./pages/Ai'));

function Splash({ text }: { text?: string }) {
  return <div className="splash"><div className="brand big"><span className="brand-mark">F</span>FitFlow</div>{text && <p className="muted">{text}</p>}</div>;
}

/** Event-based background work: achievements and the weekly report. Runs after data changes, never on a timer. */
function Background({ signedIn }: { signedIn: boolean }) {
  const { t } = useT();
  const data = useData();
  const recipes = useTable('recipes'), plans = useTable('workout_plans'), reflections = useTable('reflections');
  useEffect(() => {
    const id = setTimeout(() => {
      const n = getPrefs().notifications;
      const fresh = checkAchievements();
      if (fresh.length) {
        const text = `${t('ach.unlocked')}: ${fresh.map((k) => t(`ach.${k}.t`)).join(', ')}`;
        toast(text);
        if (n.milestones) void notify('FitFlow', text);
      }
      void ensureWeeklyReport(signedIn).then((created) => { if (created && n.weekly) void notify('FitFlow', t('home.report_ready')); });
    }, 1200);
    return () => clearTimeout(id);
  }, [data, recipes, plans, reflections, signedIn, t]);
  return null;
}

/** All screens. Gym Mode is full-screen; everything else sits inside the navigation layout. */
function Shell() {
  const { t } = useT();
  const { pathname } = useLocation();
  const routes = (
    <Suspense fallback={<div className="page"><p className="muted">{t('c.loading')}</p></div>}>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/nutrition" element={<Nutrition />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/:id" element={<RecipeBuilder />} />
        <Route path="/gym" element={<Gym />} />
        <Route path="/gym/plan/:id" element={<PlanEditor />} />
        <Route path="/gym/import" element={<PlanImport />} />
        <Route path="/gym/session/:id" element={<GymMode />} />
        <Route path="/calendar" element={<CalendarPage />} />
        <Route path="/sleep" element={<Sleep />} />
        <Route path="/hydration" element={<Hydration />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/habits" element={<Habits />} />
        <Route path="/goals" element={<Goals />} />
        <Route path="/progress" element={<Progress />} />
        <Route path="/ai" element={<AiPage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
  return pathname.startsWith('/gym/session/') ? routes : <Layout>{routes}</Layout>;
}

export default function App() {
  const auth = useAuth();
  const sync = useSyncStatus();
  const profile = useProfile();
  const prefs = usePrefs();
  const { t } = useT();

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    localStorage.setItem('ff_theme', prefs.theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', prefs.theme === 'light' ? '#f3f5ef' : '#0e1012');
  }, [prefs.theme]);
  useEffect(() => { if (prefs.id) setLang(prefs.language); }, [prefs.id, prefs.language]);
  useEffect(() => {
    scheduleWaterReminder(prefs.notifications.water, prefs.notifications.water_every_min, t('water.reminder_title'), t('water.reminder_body'));
  }, [prefs.notifications.water, prefs.notifications.water_every_min, t]);

  // Daily reminders (workout / habits / sleep routine) – checked once a minute while the app is open.
  useEffect(() => startDailyReminders(() => {
    const n = getPrefs().notifications;
    const d = today();
    const day = getData().day(d);
    const out: { id: string; time: string; body: string }[] = [];
    if (n.workout && !day.has.gym && getTable('workout_days').some((w) => w.weekdays?.includes(weekdayIndex(d)))) out.push({ id: 'workout', time: n.workout_time, body: t('rem.workout') });
    if (n.habits && getData().habits.length > day.habitLogs.length) out.push({ id: 'habits', time: n.habits_time, body: t('rem.habits') });
    const bed = getProfile()?.sleep_bedtime;
    if (n.sleep && bed) { const m = (hhmmToMin(bed) + 1440 - 30) % 1440; out.push({ id: 'sleep', time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`, body: t('rem.sleep') }); }
    return out;
  }), [t]);

  let content;
  if (!auth.ready) content = <Splash />;
  else if (auth.recovery || (auth.configured && !auth.user && !auth.localOnly)) content = <AuthPage />;
  else if (auth.user && !sync.first) content = <Splash text={t('sync.syncing')} />;
  else if (!profile?.onboarded) content = <Onboarding />;
  else content = <><Background signedIn={!!auth.user} /><Shell /></>;
  return (
    <HashRouter>
      {content}
      <Toaster />
      <ConfirmHost />
    </HashRouter>
  );
}
