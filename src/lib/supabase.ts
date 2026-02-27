import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

const PLACEHOLDER_URL = 'https://placeholder.supabase.co';
const PLACEHOLDER_KEY = 'placeholder-anon-key';

/**
 * True only when real (non-placeholder) credentials are present.
 * Used to show the setup screen before any API call is attempted.
 */
export const isSupabaseConfigured =
  !!supabaseUrl &&
  !!supabaseAnonKey &&
  supabaseUrl !== PLACEHOLDER_URL &&
  supabaseAnonKey !== PLACEHOLDER_KEY &&
  supabaseUrl.startsWith('https://');

if (!isSupabaseConfigured) {
  console.warn(
    '[Mekai] Supabase credentials are missing or are still placeholders.\n' +
    'Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.'
  );
}

// Project-scoped storage key prevents stale tokens from old/placeholder projects
// from being picked up by this client instance.
const PROJECT_REF = 'ubuqpnazjabiubuwcrxc';

// Run cleanup BEFORE createClient so the client never loads a stale token
// into memory. Deletes any generic or foreign-project auth keys from localStorage.
;(() => {
  if (typeof localStorage === 'undefined') return;
  const staleKeys = ['sb-auth-token', 'supabase.auth.token'];
  for (const key of staleKeys) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      console.warn(`[Mekai] Removed stale auth key: "${key}". Please log in again.`);
    }
  }
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token') && !key.includes(PROJECT_REF)) {
      localStorage.removeItem(key);
      console.warn(`[Mekai] Removed foreign project auth key: "${key}". Please log in again.`);
    }
  }
})();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    storageKey: `sb-${PROJECT_REF}-auth-token`,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Storage helpers
export const BUCKETS = {
  COVERS: 'covers',
  PAGES: 'pages',
} as const;

export function getCoverUrl(path: string) {
  const { data } = supabase.storage.from(BUCKETS.COVERS).getPublicUrl(path);
  return data.publicUrl;
}

export function getPageUrl(path: string) {
  const { data } = supabase.storage.from(BUCKETS.PAGES).getPublicUrl(path);
  return data.publicUrl;
}
