import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './styles/global.scss';
import App from './App';
import { initDb } from './lib/db';
import { initSync } from './lib/sync';
import { initAuth } from './lib/auth';

const theme = localStorage.getItem('ff_theme');
if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;

async function boot() {
  const root = createRoot(document.getElementById('root')!);
  try {
    await initDb();
    initSync();
    await initAuth();
    root.render(<StrictMode><App /></StrictMode>);
  } catch (e) {
    console.error(e);
    root.render(<div className="splash"><p>FitFlow could not open its local database. Private browsing mode may block storage.</p></div>);
  }
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('Service worker registration failed', err));
  }
}
void boot();
