import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/** null when no Supabase project is configured → FitFlow runs in local-only mode. */
export const supabase: SupabaseClient | null =
  url && key && !url.includes('YOUR-PROJECT')
    // PKCE keeps OAuth / recovery tokens out of the URL hash, which the hash router uses for navigation
    ? createClient(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
    : null;
