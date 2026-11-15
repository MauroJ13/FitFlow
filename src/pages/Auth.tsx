import { useState } from 'react';
import { Activity, Mail, Moon, Sparkles } from 'lucide-react';
import { LANGS, setLang, useT } from '../i18n';
import { resendVerification, resetPassword, setLocalOnly, setNewPassword, signIn, signInWithEmailLink, signInWithProvider, signUp, useAuth } from '../lib/auth';
import { Btn, Field, Seg, TextInput } from '../components/ui';

type View = 'welcome' | 'login' | 'register' | 'recover' | 'verify' | 'link_sent';
const EMAIL = /^\S+@\S+\.\S+$/;

/** Welcome, registration, login, password recovery, e-mail verification and "set new password". */
export default function AuthPage() {
  const { t, lang } = useT();
  const auth = useAuth();
  const [view, setView] = useState<View>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');

  const go = (v: View) => { setErr(''); setInfo(''); setView(v); };
  const run = async (fn: () => Promise<void>) => { setErr(''); setInfo(''); setBusy(true); try { await fn(); } finally { setBusy(false); } };
  const validEmail = () => { if (!EMAIL.test(email.trim())) { setErr(t('auth.v.email')); return false; } return true; };
  const validPassword = () => { if (password.length < 8) { setErr(t('auth.v.password')); return false; } return true; };

  const login = () => validEmail() && validPassword() && run(async () => { const e = await signIn(email.trim(), password); if (e) setErr(e); });
  const register = () => validEmail() && validPassword() && run(async () => {
    const r = await signUp(email.trim(), password);
    if (r.error) setErr(r.error); else if (r.confirm) setView('verify');
  });
  const recover = () => validEmail() && run(async () => { const e = await resetPassword(email.trim()); if (e) setErr(e); else setInfo(t('auth.reset_sent')); });
  const emailLink = () => validEmail() && run(async () => { const e = await signInWithEmailLink(email.trim()); if (e) setErr(e); else setView('link_sent'); });
  const oauth = (p: 'google' | 'apple') => run(async () => { const e = await signInWithProvider(p); if (e) setErr(e); });
  const newPassword = () => validPassword() && run(async () => { const e = await setNewPassword(password); if (e) setErr(e); });

  const messages = <>{err && <p className="field-error" role="alert">{err}</p>}{info && <p className="hint-box">{info}</p>}</>;
  const emailField = <Field label={t('auth.email')}><TextInput type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>;
  const social = (
    <div className="stack tight">
      <Btn block disabled={busy} onClick={() => oauth('apple')}>{t('auth.apple')}</Btn>
      <Btn block disabled={busy} onClick={() => oauth('google')}>{t('auth.google')}</Btn>
    </div>
  );

  let body;
  if (auth.recovery) {
    body = (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void newPassword(); }}>
        <h2>{t('auth.new_password')}</h2>
        <Field label={t('auth.password')} hint={t('auth.v.password')}><TextInput type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {messages}
        <Btn variant="primary" block type="submit" disabled={busy}>{t('c.save')}</Btn>
      </form>
    );
  } else if (view === 'welcome') {
    body = (
      <div className="stack">
        <h2>{t('auth.welcome')}</h2>
        <ul className="feature-list">
          <li><Activity size={18} /> {t('auth.f1')}</li>
          <li><Moon size={18} /> {t('auth.f2')}</li>
          <li><Sparkles size={18} /> {t('auth.f3')}</li>
        </ul>
        <Btn variant="primary" block onClick={() => go('register')}>{t('auth.sign_up')}</Btn>
        <Btn block onClick={() => go('login')}>{t('auth.have_account')}</Btn>
        {social}
        {messages}
        <hr />
        <Btn variant="ghost" block onClick={() => setLocalOnly(true)}>{t('auth.local')}</Btn>
        <p className="muted small">{t('auth.local_hint')}</p>
      </div>
    );
  } else if (view === 'login' || view === 'register') {
    const isLogin = view === 'login';
    body = (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void (isLogin ? login() : register()); }}>
        <h2>{isLogin ? t('auth.sign_in') : t('auth.sign_up')}</h2>
        {emailField}
        <Field label={t('auth.password')} hint={isLogin ? undefined : t('auth.v.password')}>
          <TextInput type="password" autoComplete={isLogin ? 'current-password' : 'new-password'} value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {messages}
        <Btn variant="primary" block type="submit" disabled={busy}>{busy ? t('c.loading') : isLogin ? t('auth.sign_in') : t('auth.sign_up')}</Btn>
        <Btn block disabled={busy} onClick={emailLink}><Mail size={18} />{t('auth.email_link')}</Btn>
        {social}
        {isLogin && <button type="button" className="textlink" onClick={() => go('recover')}>{t('auth.forgot')}</button>}
        <button type="button" className="textlink" onClick={() => go(isLogin ? 'register' : 'login')}>{isLogin ? t('auth.no_account') : t('auth.have_account')}</button>
        <button type="button" className="textlink" onClick={() => go('welcome')}>{t('c.back')}</button>
      </form>
    );
  } else if (view === 'recover') {
    body = (
      <form className="stack" onSubmit={(e) => { e.preventDefault(); void recover(); }}>
        <h2>{t('auth.recover')}</h2>
        <p className="muted">{t('auth.recover_hint')}</p>
        {emailField}
        {messages}
        <Btn variant="primary" block type="submit" disabled={busy}>{t('auth.send_reset')}</Btn>
        <button type="button" className="textlink" onClick={() => go('login')}>{t('c.back')}</button>
      </form>
    );
  } else {
    body = (
      <div className="stack">
        <h2>{view === 'verify' ? t('auth.verify') : t('auth.link_sent')}</h2>
        <p className="muted">{t(view === 'verify' ? 'auth.confirm' : 'auth.link_sent_hint', { email: email.trim() })}</p>
        {messages}
        {view === 'verify' && <Btn block disabled={busy} onClick={() => run(async () => { const e = await resendVerification(email.trim()); if (e) setErr(e); else setInfo(t('auth.resent')); })}>{t('auth.resend')}</Btn>}
        <Btn variant="primary" block onClick={() => go('login')}>{t('auth.sign_in')}</Btn>
      </div>
    );
  }

  return (
    <div className="center-page">
      <div className="auth-card stack">
        <div className="brand big"><span className="brand-mark">F</span>FitFlow</div>
        <p className="muted">{t('auth.tagline')}</p>
        <Seg value={lang} onChange={setLang} options={LANGS.map((l) => ({ v: l.id, l: l.label }))} />
        {body}
      </div>
    </div>
  );
}
