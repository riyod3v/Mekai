import { supabase } from '@/lib/supabase';
import type { WordVaultEntry } from '@/types';

export async function fetchWordVault(userId: string): Promise<WordVaultEntry[]> {
  const { data, error } = await supabase
    .from('word_vault')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data as WordVaultEntry[];
}

export async function addToWordVault(entry: {
  userId: string;
  original: string;
  translated: string;
  romaji?: string | null;
  sourcePageId?: string | null;
}): Promise<WordVaultEntry> {
  const { data, error } = await supabase
    .from('word_vault')
    .insert({
      user_id: entry.userId,
      original: entry.original,
      translated: entry.translated,
      romaji: entry.romaji ?? null,
      source_page_id: entry.sourcePageId ?? null,
    })
    .select()
    .single();
  if (error) throw error;
  return data as WordVaultEntry;
}

export async function deleteFromWordVault(id: string): Promise<void> {
  const { error } = await supabase.from('word_vault').delete().eq('id', id);
  if (error) throw error;
}

// ─── Canonical alias (session-based, no userId param) ────────

/** Fetch the signed-in user's word vault, newest first. */
export async function listMyWordVault(): Promise<WordVaultEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');
  return fetchWordVault(user.id);
}
