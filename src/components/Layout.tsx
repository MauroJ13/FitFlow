import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { Target, Bot, CalendarDays, ChefHat, CloudOff, Droplets, Dumbbell, Footprints, Home, Moon, RefreshCw, Sparkles, TrendingUp, User, Utensils, WifiOff, Check } from 'lucide-react';
import { useT } from '../i18n';
import { syncNow, useSyncStatus } from '../lib/sync';
import { cx } from './ui';

export const MAIN_NAV = [
  { to: '/', icon: Home, key: 'nav.home' },
  { to: '/nutrition', icon: Utensils, key: 'nav.nutrition' },
  { to: '/gym', icon: Dumbbell, key: 'nav.gym' },
  { to: '/calendar', icon: CalendarDays, key: 'nav.calendar' },
  { to: '/profile', icon: User, key: 'nav.profile' },
];
export const MORE_NAV = [
  { to: '/recipes', icon: ChefHat, key: 'nav.recipes' },
  { to: '/sleep', icon: Moon, key: 'nav.sleep' },
  { to: '/hydration', icon: Droplets, key: 'nav.hydration' },
  { to: '/activity', icon: Footprints, key: 'nav.activity' },
  { to: '/habits', icon: Sparkles, key: 'nav.habits' },
  { to: '/goals', icon: Target, key: 'nav.goals' },
  { to: '/progress', icon: TrendingUp, key: 'nav.progress' },
  { to: '/ai', icon: Bot, key: 'nav.ai' },
];
const SIDE_NAV = [MAIN_NAV[0], MAIN_NAV[1], MORE_NAV[0], MAIN_NAV[2], MAIN_NAV[3], ...MORE_NAV.slice(1), MAIN_NAV[4]];

export function SyncBadge() {
  const { t } = useT();
  const s = useSyncStatus();
  const map = {
    local: { icon: <CloudOff size={15} />, text: t('sync.local') },
    idle: { icon: <Check size={15} />, text: s.pending ? t('sync.pending', { n: s.pending }) : t('sync.ok') },
    syncing: { icon: <RefreshCw size={15} className="spin" />, text: t('sync.syncing') },
    offline: { icon: <WifiOff size={15} />, text: s.pending ? t('sync.offline_pending', { n: s.pending }) : t('sync.offline') },
    error: { icon: <WifiOff size={15} />, text: t('sync.error') },
  }[s.state];
  return (
    <button type="button" className={cx('syncbadge', s.state)} onClick={() => void syncNow()} title={s.error ?? map.text}>
      {map.icon}<span>{map.text}</span>
    </button>
  );
}

export function Layout({ children }: { children: ReactNode }) {
  const { t } = useT();
  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">F</span>FitFlow</div>
        <nav>
          {SIDE_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('side-link', isActive && 'on')}>
              <n.icon size={19} /><span>{t(n.key)}</span>
            </NavLink>
          ))}
        </nav>
        <SyncBadge />
      </aside>
      <main className="main">{children}</main>
      <nav className="bottomnav" aria-label="Main">
        {MAIN_NAV.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => cx('bn-link', isActive && 'on')}>
            <n.icon size={22} /><span>{t(n.key)}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
