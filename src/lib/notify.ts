/** Sound, vibration and local notifications. Everything here is optional and fails silently if unsupported. */
let ctx: AudioContext | null = null;

/** Call from a user gesture (e.g. "complete set") so the browser allows sound later. */
export function primeAudio() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx = ctx ?? new AC();
    if (ctx.state === 'suspended') void ctx.resume();
  } catch { /* no audio available */ }
}
export function beep(times = 3) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  for (let i = 0; i < times; i++) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = i === times - 1 ? 1175 : 880;
    gain.gain.setValueAtTime(0.0001, t0 + i * 0.25);
    gain.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.25 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.25 + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0 + i * 0.25);
    osc.stop(t0 + i * 0.25 + 0.22);
  }
}
/** Not supported on iOS Safari – the sound is the fallback there. */
export function vibrate(pattern: number[] = [250, 120, 250]) {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}

export const notificationsSupported = () => 'Notification' in window;
export async function askNotificationPermission(): Promise<boolean> {
  if (!notificationsSupported()) return false;
  if (Notification.permission === 'granted') return true;
  return (await Notification.requestPermission()) === 'granted';
}
export async function notify(title: string, body: string) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification(title, { body, icon: 'icons/icon-192.png', tag: 'fitflow' });
    else new Notification(title, { body });
  } catch { /* ignore */ }
}

let reminder: ReturnType<typeof setInterval> | undefined;
/**
 * Hydration reminder while the app is open (foreground or installed PWA kept in the background).
 * A web app cannot schedule notifications while fully closed without a push server.
 */
export function scheduleWaterReminder(on: boolean, everyMin: number, title: string, body: string) {
  clearInterval(reminder);
  if (!on) return;
  reminder = setInterval(() => {
    const h = new Date().getHours();
    if (h >= 8 && h < 21) void notify(title, body);
  }, Math.max(15, everyMin) * 60_000);
}

/**
 * Fires each due reminder at most once per day. `due()` is evaluated every minute, so reminders
 * depend on current data (e.g. no workout reminder once today's workout is recorded).
 */
export function startDailyReminders(due: () => { id: string; time: string; body: string }[]): () => void {
  const id = setInterval(() => {
    if (!notificationsSupported() || Notification.permission !== 'granted') return;
    const now = new Date();
    const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const dayKey = now.toDateString();
    for (const r of due()) {
      const key = `ff_rem_${r.id}`;
      if (hhmm >= r.time && localStorage.getItem(key) !== dayKey && Number(hhmm.slice(0, 2)) - Number(r.time.slice(0, 2)) < 2) {
        localStorage.setItem(key, dayKey);
        void notify('FitFlow', r.body);
      }
    }
  }, 60_000);
  return () => clearInterval(id);
}

let wakeLock: { release: () => Promise<void> } | null = null;
/** Keep the screen on during a workout where the browser supports it. */
export async function keepAwake(on: boolean) {
  try {
    if (on && !wakeLock) {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
      wakeLock = (await nav.wakeLock?.request('screen')) ?? null;
    } else if (!on && wakeLock) { await wakeLock.release(); wakeLock = null; }
  } catch { wakeLock = null; }
}
