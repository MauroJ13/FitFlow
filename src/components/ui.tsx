import { useEffect, useState, useSyncExternalStore, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { translate, useT } from '../i18n';
import { addDays, today } from '../lib/date';

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'soft' | 'ghost' | 'danger'; block?: boolean; small?: boolean };
export function Btn({ variant = 'soft', block, small, className, ...p }: BtnProps) {
  return <button type="button" {...p} className={cx('btn', variant, block && 'block', small && 'small', className)} />;
}
export function IconBtn({ label, className, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" aria-label={label} title={label} {...p} className={cx('iconbtn', className)} />;
}

export function Card({ title, to, action, children, className }: { title?: ReactNode; to?: string; action?: ReactNode; children?: ReactNode; className?: string }) {
  return (
    <section className={cx('card', className)}>
      {(title || action) && (
        <header className="card-head">
          {to ? <Link to={to} className="card-title link">{title}<ChevronRight size={16} /></Link> : <h3 className="card-title">{title}</h3>}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

export function PageHead({ title, sub, back, children, lead }: { title: ReactNode; sub?: ReactNode; back?: string | true; children?: ReactNode; lead?: ReactNode }) {
  const nav = useNavigate();
  const { t } = useT();
  return (
    <header className="page-head">
      {back && (
        <IconBtn label={t('c.back')} onClick={() => (back === true ? nav(-1) : nav(back))}><ChevronLeft size={22} /></IconBtn>
      )}
      {lead}
      <div className="grow">
        <h1>{title}</h1>
        {sub && <p className="muted small">{sub}</p>}
      </div>
      {children && <div className="row">{children}</div>}
    </header>
  );
}

export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="overlay" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <IconBtn label={translate('c.close')} onClick={onClose}><X size={20} /></IconBtn>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Field({ label, hint, error, children, group }: { label: ReactNode; hint?: ReactNode; error?: string | null; children: ReactNode; group?: boolean }) {
  const body = (
    <>
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </>
  );
  // A group of buttons must not sit inside <label>, otherwise a tap on the caption would press the first button.
  return group ? <div className="field" role="group">{body}</div> : <label className="field">{body}</label>;
}
export function TextInput({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...p} className={cx('input', className)} />;
}

const parseNum = (s: string): number | null => {
  const t = s.replace(',', '.').trim();
  return t === '' || t === '.' || Number.isNaN(Number(t)) ? null : Number(t);
};
/** Numeric input that accepts both "." and "," as decimal separator and never yields negative numbers. */
export function NumInput({ value, onChange, max, className, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'max'> & { value: number | null; onChange: (v: number | null) => void; max?: number }) {
  const [txt, setTxt] = useState(value == null ? '' : String(value));
  useEffect(() => { if (parseNum(txt) !== value) setTxt(value == null ? '' : String(value)); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <input
      {...rest}
      className={cx('input', className)}
      inputMode="decimal"
      value={txt}
      onBlur={() => setTxt(value == null ? '' : String(value))}
      onChange={(e) => {
        const raw = e.target.value;
        if (!/^\d*[.,]?\d*$/.test(raw)) return;
        let n = parseNum(raw);
        if (n != null && max != null && n > max) { n = max; setTxt(String(max)); } else setTxt(raw);
        onChange(n);
      }}
    />
  );
}

export function Seg<V extends string>({ value, onChange, options }: { value: V; onChange: (v: V) => void; options: { v: V; l: ReactNode }[] }) {
  return (
    <div className="seg" role="tablist">
      {options.map((o) => (
        <button key={o.v} type="button" role="tab" aria-selected={o.v === value} className={cx(o.v === value && 'on')} onClick={() => onChange(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}
export function Chips({ options, value, onToggle }: { options: { v: string; l: ReactNode }[]; value: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="chips">
      {options.map((o) => (
        <button key={o.v} type="button" aria-pressed={value.includes(o.v)} className={cx('chip', value.includes(o.v) && 'on')} onClick={() => onToggle(o.v)}>{o.l}</button>
      ))}
    </div>
  );
}
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="toggle">
      <span className="grow">{label}</span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="toggle-track" aria-hidden="true" />
    </label>
  );
}

export function Empty({ icon, title, text, children }: { icon?: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="empty">
      {icon && <div className="empty-icon">{icon}</div>}
      <strong>{title}</strong>
      {text && <p className="muted small">{text}</p>}
      {children}
    </div>
  );
}

export function Ring({ value, max, size = 72, children, color = 'var(--accent)' }: { value: number; max: number; size?: number; children?: ReactNode; color?: string }) {
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.min(1, value / max) : 0;
  return (
    <div className="ring" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth="8" />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dashoffset .4s ease' }} />
      </svg>
      <div className="ring-label">{children}</div>
    </div>
  );
}

export function DateNav({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  const { t, date: fmt } = useT();
  const isToday = date === today();
  return (
    <div className="datenav">
      <IconBtn label={t('c.prev')} onClick={() => onChange(addDays(date, -1))}><ChevronLeft size={20} /></IconBtn>
      <label className="datenav-label">
        <span>{isToday ? t('c.today') : fmt(date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>
        <input type="date" value={date} max={today()} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label={t('c.date')} />
      </label>
      <IconBtn label={t('c.next')} disabled={isToday} onClick={() => onChange(addDays(date, 1))}><ChevronRight size={20} /></IconBtn>
    </div>
  );
}

/* ---------- toasts ---------- */
interface ToastItem { id: number; text: string; kind: 'ok' | 'error' }
let toasts: ToastItem[] = [];
const toastSubs = new Set<() => void>();
const emitToasts = () => toastSubs.forEach((f) => f());
export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  const item = { id: Date.now() + Math.random(), text, kind };
  // never stack more than two messages and never show the same text twice
  toasts = [...toasts.filter((x) => x.text !== text), item].slice(-2);
  emitToasts();
  setTimeout(() => { toasts = toasts.filter((t) => t !== item); emitToasts(); }, kind === 'error' ? 5000 : 2200);
}
export function Toaster() {
  const list = useSyncExternalStore((f) => { toastSubs.add(f); return () => { toastSubs.delete(f); }; }, () => toasts);
  return createPortal(
    <div className="toasts" aria-live="polite">{list.map((t) => <div key={t.id} className={cx('toast', t.kind)}>{t.text}</div>)}</div>,
    document.body,
  );
}

/* ---------- confirm dialog ---------- */
interface ConfirmState { text: string; ok: string; danger: boolean; resolve: (v: boolean) => void }
let confirmState: ConfirmState | null = null;
const confirmSubs = new Set<() => void>();
export function confirmDialog(text: string, opts: { ok?: string; danger?: boolean } = {}): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState = { text, ok: opts.ok ?? translate('c.confirm'), danger: opts.danger ?? true, resolve };
    confirmSubs.forEach((f) => f());
  });
}
export function ConfirmHost() {
  const s = useSyncExternalStore((f) => { confirmSubs.add(f); return () => { confirmSubs.delete(f); }; }, () => confirmState);
  const { t } = useT();
  if (!s) return null;
  const done = (v: boolean) => { s.resolve(v); confirmState = null; confirmSubs.forEach((f) => f()); };
  return (
    <Sheet open onClose={() => done(false)} title={t('c.sure')}
      footer={<><Btn onClick={() => done(false)}>{t('c.cancel')}</Btn><Btn variant={s.danger ? 'danger' : 'primary'} onClick={() => done(true)}>{s.ok}</Btn></>}>
      <p>{s.text}</p>
    </Sheet>
  );
}
