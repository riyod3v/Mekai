import { supabase } from '@/lib/supabase';
import type { WordVaultEntry, CreateWordVaultInput } from '@/types';

// ─── Queries ─────────────────────────────────────────────────

/** Fetch the signed-in user's word vault, newest first. */
export async function fetchWordVault(): Promise<WordVaultEntry[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { data, error } = await supabase
    .from('word_vault')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as WordVaultEntry[];
}

// ─── Mutations ────────────────────────────────────────────────

/** Add an entry to the signed-in user's word vault. */
export async function addToWordVault(input: CreateWordVaultInput): Promise<WordVaultEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { data, error } = await supabase
    .from('word_vault')
    .insert({
      user_id: user.id,
      chapter_id: input.chapter_id ?? null,
      page_index: input.page_index ?? null,
      region: input.region ?? null,
      original: input.original,
      translated: input.translated,
      romaji: input.romaji ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as WordVaultEntry;
}

/** Delete an entry from the word vault by id. */
export async function deleteFromWordVault(id: string): Promise<void> {
  if (!id) throw new TypeError('id must be a non-empty string');

  const { error } = await supabase
    .from('word_vault')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
