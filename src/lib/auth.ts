import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { countDirty, setUserId, wipeLocal } from './db';
import { setSyncUser, syncNow } from './sync';

export interface AuthState {
  ready: boolean;
  configured: boolean;
  user: { id: string; email: string } | null;
  /** The user chose to use this device without an account. */
  localOnly: boolean;
  /** The user arrived through a password-recovery link and must set a new password. */
  recovery: boolean;
}

let state: AuthState = {
  ready: !supabase,
  configured: !!supabase,
  user: null,
  localOnly: !supabase || localStorage.getItem('ff_local') === '1',
  recovery: false,
};
const subs = new Set<() => void>();
function set(patch: Partial<AuthState>) { state = { ...state, ...patch }; subs.forEach((f) => f()); }
export function useAuth(): AuthState {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => state);
}

async function applyUser(user: { id: string; email?: string } | null | undefined) {
  const next = user ? { id: user.id, email: user.email ?? '' } : null;
  if (next?.id === state.user?.id && state.ready) return;
  if (next) {
    // A different account on this device must never inherit the previous user's local data.
    const last = localStorage.getItem('ff_uid');
    if (last && last !== next.id) await wipeLocal();
    localStorage.setItem('ff_uid', next.id);
    localStorage.setItem('ff_email', next.email);
  }
  setUserId(next?.id ?? null);
  setSyncUser(next?.id ?? null);
  set({ user: next, ready: true });
  if (next) void syncNow();
}

export async function initAuth() {
  if (!supabase) return;
  let user: { id: string; email?: string } | null = null;
  try {
    const { data } = await supabase.auth.getSession();
    user = data.session?.user ?? null;
  } catch { /* offline */ }
  // Offline start with an expired token: keep working locally as the last signed-in user.
  const last = localStorage.getItem('ff_uid');
  if (!user && !navigator.onLine && last) user = { id: last, email: localStorage.getItem('ff_email') ?? '' };
  await applyUser(user);
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'PASSWORD_RECOVERY') set({ recovery: true });
    if (event === 'INITIAL_SESSION') return;
    if (!session && !navigator.onLine) return;
    void applyUser(session?.user);
  });
}

export async function signIn(email: string, password: string): Promise<string | null> {
  const { error } = await supabase!.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}
/** Returns { error } or { confirm: true } when the project requires e-mail confirmation. */
export async function signUp(email: string, password: string): Promise<{ error?: string; confirm?: boolean }> {
  const { data, error } = await supabase!.auth.signUp({ email, password });
  if (error) return { error: error.message };
  return { confirm: !data.session };
}
export async function resetPassword(email: string): Promise<string | null> {
  const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + window.location.pathname });
  return error ? error.message : null;
}
export function setLocalOnly(on: boolean) {
  if (on) localStorage.setItem('ff_local', '1'); else localStorage.removeItem('ff_local');
  set({ localOnly: on });
}

/** Number of local changes that are not on the server yet (after one last sync attempt). */
export async function unsyncedBeforeSignOut(): Promise<number> {
  await syncNow();
  return countDirty();
}
/** Signs out and removes the private data from this device. */
export async function signOut() {
  await supabase?.auth.signOut();
  localStorage.removeItem('ff_uid');
  localStorage.removeItem('ff_email');
  await wipeLocal();
  window.location.reload();
}

const redirectTo = () => window.location.origin + window.location.pathname;
/** Google / Apple sign-in. The provider must be enabled in the Supabase dashboard (see README). */
export async function signInWithProvider(provider: 'google' | 'apple'): Promise<string | null> {
  const { error } = await supabase!.auth.signInWithOAuth({ provider, options: { redirectTo: redirectTo() } });
  return error ? error.message : null;
}
/** Passwordless e-mail link ("Continue with e-mail"). */
export async function signInWithEmailLink(email: string): Promise<string | null> {
  const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo() } });
  return error ? error.message : null;
}
export async function resendVerification(email: string): Promise<string | null> {
  const { error } = await supabase!.auth.resend({ type: 'signup', email, options: { emailRedirectTo: redirectTo() } });
  return error ? error.message : null;
}
export async function setNewPassword(password: string): Promise<string | null> {
  const { error } = await supabase!.auth.updateUser({ password });
  if (!error) set({ recovery: false });
  return error ? error.message : null;
}
