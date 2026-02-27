import { supabase } from '@/lib/supabase';
import type { TranslationHistoryRow, CreateTranslationHistoryInput } from '@/types';

// ─── Queries ─────────────────────────────────────────────────

/**
 * Fetch all translation history rows for a chapter belonging to the
 * signed-in user, newest first.
 * (region is a JSONB column now — returned directly as an object.)
 */
export async function fetchTranslationHistoryByChapter(
  chapterId: string,
): Promise<TranslationHistoryRow[]> {
  if (!chapterId) throw new TypeError('chapterId must be a non-empty string');

  const { data, error } = await supabase
    .from('translation_history')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);
  return data as TranslationHistoryRow[];
}

// ─── Mutations ────────────────────────────────────────────────

/** Insert a new translation history row for the signed-in user. */
export async function createTranslationHistory(
  input: CreateTranslationHistoryInput,
): Promise<TranslationHistoryRow> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { data, error } = await supabase
    .from('translation_history')
    .insert({
      user_id: user.id,
      chapter_id: input.chapter_id,
      page_index: input.page_index,
      region: input.region,
      region_hash: input.region_hash,
      ocr_text: input.ocr_text.trim(),
      translated: input.translated,
      romaji: input.romaji ?? null,
    })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as TranslationHistoryRow;
}

/** Delete a translation history row by id. */
export async function deleteTranslationHistory(id: string): Promise<void> {
  if (!id) throw new TypeError('id must be a non-empty string');

  const { error } = await supabase
    .from('translation_history')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
export const addHistoryEntry        = createTranslationHistory;
export const deleteHistoryEntry     = deleteTranslationHistory;
