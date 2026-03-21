/**
 * Centralized Supabase browser client.
 *
 * This is the ONLY place in the frontend where `createClient` is called.
 * Import `supabase` (and helpers) from here — or from the re-export barrel
 * at `@/lib/supabase` — everywhere else in the app.
 *
 * Credentials are read exclusively from Vite environment variables:
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_ANON_KEY
 *
 * No secrets are hardcoded in this file.
 */

import { createClient } from '@supabase/supabase-js';
import { logger } from '@/lib/utils/logger';

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
  logger.warn(
    '[Mekai] Supabase credentials are missing or are still placeholders.\n' +
    'Fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.'
  );
}

const PROJECT_REF = supabaseUrl
  ? new URL(supabaseUrl).hostname.split('.')[0]
  : 'unknown';

;(() => {
  if (typeof localStorage === 'undefined') return;
  const staleKeys = ['sb-auth-token', 'supabase.auth.token'];
  for (const key of staleKeys) {
    if (localStorage.getItem(key) !== null) {
      localStorage.removeItem(key);
      logger.warn(`[Mekai] Removed stale auth key: "${key}". Please log in again.`);
    }
  }
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith('sb-') && key.endsWith('-auth-token') && !key.includes(PROJECT_REF)) {
      localStorage.removeItem(key);
      logger.warn(`[Mekai] Removed foreign project auth key: "${key}". Please log in again.`);
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
