import { supabase } from '@/lib/supabase';
import type { TranslationHistoryRow, CreateTranslationHistoryInput } from '@/types';

// ─── Validation ───────────────────────────────────────────────

function validateInput(input: CreateTranslationHistoryInput): void {
  if (!input.manga_id || typeof input.manga_id !== 'string') {
    throw new TypeError('manga_id must be a non-empty string');
  }
  if (!input.chapter_id || typeof input.chapter_id !== 'string') {
    throw new TypeError('chapter_id must be a non-empty string');
  }
  if (!Number.isInteger(input.page_index) || input.page_index < 0) {
    throw new RangeError('page_index must be a non-negative integer');
  }
  const { x, y, w, h } = input.region;
  for (const [k, v] of [['x', x], ['y', y], ['w', w], ['h', h]] as [string, number][]) {
    if (typeof v !== 'number' || v < 0 || v > 1) {
      throw new RangeError(`region.${k} must be a number in 0..1 (got ${v})`);
    }
  }
  if (!input.ocr_text || typeof input.ocr_text !== 'string') {
    throw new TypeError('ocr_text must be a non-empty string');
  }
  if (typeof input.translated !== 'string') {
    throw new TypeError('translated must be a string');
  }
}

// ─── Queries ─────────────────────────────────────────────────

/**
 * Fetch all translation history rows for a chapter belonging to the
 * signed-in user, newest first.
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
  validateInput(input);

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { data, error } = await supabase
    .from('translation_history')
    .insert({
      user_id: user.id,
      manga_id: input.manga_id,
      chapter_id: input.chapter_id,
      page_index: input.page_index,
      region_x: input.region.x,
      region_y: input.region.y,
      region_w: input.region.w,
      region_h: input.region.h,
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
