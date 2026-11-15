import { useCallback, useEffect, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, SkipForward } from 'lucide-react';
import { useT } from '../i18n';
import { fmtClock } from '../lib/date';
import { beep, primeAudio, vibrate } from '../lib/notify';
import { Btn, Ring } from './ui';

export interface RestTimerApi {
  /** Seconds left, total duration and state. */
  left: number; total: number; running: boolean; active: boolean;
  start: (seconds: number) => void; pause: () => void; resume: () => void; skip: () => void; restart: () => void; add: (delta: number) => void;
}

/**
 * Countdown based on a wall-clock end time, so it stays correct when the phone
 * locks or the browser throttles timers in the background.
 */
export function useRestTimer(opts: { sound: boolean; vibrate: boolean }): RestTimerApi {
  const [total, setTotal] = useState(0);
  const [left, setLeft] = useState(0);
  const [running, setRunning] = useState(false);
  const [active, setActive] = useState(false);
  const endAt = useRef(0);
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!running) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000));
      setLeft(remaining);
      if (remaining <= 0) {
        setRunning(false);
        if (optsRef.current.sound) beep();
        if (optsRef.current.vibrate) vibrate();
      }
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [running]);

  const start = useCallback((seconds: number) => {
    primeAudio();
    if (seconds <= 0) { setActive(false); setRunning(false); return; }
    endAt.current = Date.now() + seconds * 1000;
    setTotal(seconds); setLeft(seconds); setActive(true); setRunning(true);
  }, []);
  const pause = useCallback(() => { setLeft(Math.max(0, Math.ceil((endAt.current - Date.now()) / 1000))); setRunning(false); }, []);
  const resume = useCallback(() => { primeAudio(); setLeft((l) => { endAt.current = Date.now() + l * 1000; return l; }); setRunning(true); }, []);
  const skip = useCallback(() => { setRunning(false); setActive(false); setLeft(0); }, []);
  const restart = useCallback(() => { primeAudio(); setTotal((tt) => { endAt.current = Date.now() + tt * 1000; setLeft(tt); return tt; }); setActive(true); setRunning(true); }, []);
  const add = useCallback((delta: number) => {
    setLeft((l) => {
      const next = Math.max(0, l + delta);
      endAt.current = Date.now() + next * 1000;
      setTotal((tt) => Math.max(tt, next));
      return next;
    });
  }, []);
  return { left, total, running, active, start, pause, resume, skip, restart, add };
}

export function RestTimer({ timer }: { timer: RestTimerApi }) {
  const { t } = useT();
  if (!timer.active) return null;
  const done = timer.left <= 0;
  return (
    <div className={`timer ${done ? 'done' : ''}`} role="timer" aria-live="off">
      <Ring value={timer.total - timer.left} max={timer.total} size={168} color={done ? 'var(--c-gym)' : 'var(--accent)'}>
        <span className="timer-clock">{fmtClock(timer.left)}</span>
        <span className="muted small">{done ? t('gm.rest_done') : t('gm.rest')}</span>
      </Ring>
      <div className="timer-actions">
        <Btn onClick={() => timer.add(-15)} disabled={done}>−15 s</Btn>
        {timer.running
          ? <Btn onClick={timer.pause}><Pause size={18} />{t('gm.pause')}</Btn>
          : <Btn onClick={timer.resume} disabled={done}><Play size={18} />{t('gm.resume')}</Btn>}
        <Btn onClick={() => timer.add(15)} disabled={done}>+15 s</Btn>
      </div>
      <div className="timer-actions">
        <Btn onClick={timer.restart}><RotateCcw size={18} />{t('gm.restart')}</Btn>
        <Btn variant="primary" onClick={timer.skip}><SkipForward size={18} />{done ? t('c.continue') : t('gm.skip')}</Btn>
      </div>
    </div>
  );
}
