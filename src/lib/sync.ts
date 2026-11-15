/**
 * Offline-first synchronisation with Supabase.
 *  - push: dirty rows are upserted by primary key (ids are created on the client, so retries never duplicate).
 *  - pull: rows changed on the server since the last cursor are merged; last write wins by updated_at.
 *  - deletes travel as tombstones (deleted = true).
 * A database trigger refuses stale overwrites, so an old offline edit cannot destroy newer data.
 */
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { TABLES, applyRemote, countDirty, dirtyRows, getMeta, markClean, onLocalChange, setMeta, type TableName } from './db';
import type { Base } from '../types';

export interface SyncStatus {
  state: 'local' | 'idle' | 'syncing' | 'offline' | 'error';
  pending: number;
  last: string | null;
  error: string | null;
  /** true once the first sync attempt after sign-in has finished (or is impossible). */
  first: boolean;
}

let status: SyncStatus = { state: 'local', pending: 0, last: null, error: null, first: !supabase };
const subs = new Set<() => void>();
function set(patch: Partial<SyncStatus>) { status = { ...status, ...patch, pending: countDirty() }; subs.forEach((f) => f()); }
export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => status);
}

let uid: string | null = null;
let running = false;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

export function setSyncUser(id: string | null) {
  uid = id;
  set({ state: id ? 'idle' : 'local', first: !id, error: null });
}

async function push(table: TableName) {
  const rows = dirtyRows(table);
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const payload = chunk.map(({ _dirty, ...r }) => ({ ...r, user_id: uid }));
    const { error } = await supabase!.from(table).upsert(payload);
    if (error) throw new Error(`${table}: ${error.message}`);
    markClean(table, chunk);
  }
}

async function pull(table: TableName) {
  const key = `cursor:${uid}:${table}`;
  const cursor = (await getMeta<string>(key)) ?? '1970-01-01T00:00:00+00:00';
  let max = cursor;
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase!.from(table).select('*').eq('user_id', uid!)
      .gt('synced_at', cursor).order('synced_at').order('id').range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    const rows = (data ?? []) as (Base & { synced_at: string })[];
    applyRemote(table, rows);
    for (const r of rows) if (r.synced_at > max) max = r.synced_at;
    if (rows.length < 1000) break;
  }
  if (max !== cursor) await setMeta(key, max);
}

export async function syncNow(): Promise<void> {
  if (!supabase || !uid) { set({ state: 'local', first: true }); return; }
  if (!navigator.onLine) { set({ state: 'offline', first: true }); return; }
  if (running) { again = true; return; }
  running = true;
  set({ state: 'syncing', error: null });
  try {
    for (const t of TABLES) await push(t);
    for (const t of TABLES) await pull(t);
    set({ state: 'idle', last: new Date().toISOString(), first: true });
  } catch (e) {
    set({ state: navigator.onLine ? 'error' : 'offline', error: e instanceof Error ? e.message : String(e), first: true });
  } finally {
    running = false;
    if (again) { again = false; void syncNow(); }
  }
}

export function scheduleSync(delay = 1500) {
  set({});
  clearTimeout(timer);
  timer = setTimeout(() => void syncNow(), delay);
}

/** Permanently delete every row of the signed-in user on the server (children first). */
export async function deleteRemoteData(): Promise<void> {
  if (!supabase || !uid) return;
  for (const t of [...TABLES].reverse()) {
    const { error } = await supabase.from(t).delete().eq('user_id', uid);
    if (error) throw new Error(`${t}: ${error.message}`);
  }
}

export function initSync() {
  onLocalChange(() => scheduleSync());
  window.addEventListener('online', () => void syncNow());
  window.addEventListener('offline', () => set({ state: uid ? 'offline' : 'local' }));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void syncNow(); });
  setInterval(() => void syncNow(), 120_000);
}
