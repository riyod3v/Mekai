import { supabase } from '@/lib/supabase';
import type { WordVaultEntry, CreateWordVaultInput } from '@/types';
import { logger } from '@/lib/utils/logger';

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

/** Add an entry to the signed-in user's word vault. */
export async function addToWordVault(input: CreateWordVaultInput): Promise<WordVaultEntry> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  if (!input.original?.trim()) {
    throw new Error('Original text is required and cannot be empty');
  }
  if (!input.translated?.trim()) {
    throw new Error('Translated text is required and cannot be empty');
  }
  if (input.page_index !== undefined && input.page_index !== null) {
    if (!Number.isInteger(input.page_index) || input.page_index < 0) {
      throw new Error('page_index must be a non-negative integer');
    }
  }
  if (input.region) {
    const { x, y, w, h } = input.region;
    if ([x, y, w, h].some(v => typeof v !== 'number' || v < 0 || v > 1)) {
      throw new Error('Region coordinates must be numbers between 0 and 1');
    }
  }

  const payload = {
    user_id: user.id,
    chapter_id: input.chapter_id ?? null,
    page_index: input.page_index ?? null,
    region: input.region ?? null,
    region_hash: input.region_hash ?? null,
    original: input.original.trim(),
    translated: input.translated.trim(),
    romaji: input.romaji?.trim() || null,
  };

  const { data, error } = await supabase
    .from('word_vault')
    .insert(payload)
    .select()
    .single();

  if (error) {
    // Log only non-sensitive DB error metadata (dev only) — do NOT log the
    // payload, which may contain the user's translated text and OCR regions.
    logger.error('[word_vault] insert error:', { message: error.message, code: error.code });

    // PostgreSQL unique-constraint violation — the user already saved this entry.
    if (error.code === '23505') {
      throw new Error('already_saved');
    }

    throw new Error('Failed to save to Word Vault. Please try again.');
  }

  return data as WordVaultEntry;
}

/** Delete an entry from the word vault by id. */
export async function deleteFromWordVault(id: string): Promise<void> {
  if (!id) throw new TypeError('id must be a non-empty string');

  // Require authentication and scope the delete to the signed-in user's rows
  // to prevent IDOR — a different authenticated user cannot delete someone
  // else's entry even if they know the UUID.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { error } = await supabase
    .from('word_vault')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id); // IDOR guard: only deletes rows owned by the caller

  if (error) throw new Error(error.message);
}
