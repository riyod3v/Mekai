import { supabase } from '@/lib/supabase';
import type { ChapterTranslationRow, UpsertChapterTranslationInput } from '@/types';

// ─── Queries ─────────────────────────────────────────────────

/**
 * Fetch all published translations for a chapter.
 * Visibility is enforced by RLS (shared manga → any auth user, private → owner only).
 */
export async function fetchChapterTranslations(
  chapterId: string,
): Promise<ChapterTranslationRow[]> {
  if (!chapterId) throw new TypeError('chapterId must be a non-empty string');

  const { data, error } = await supabase
    .from('chapter_translations')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('page_index', { ascending: true });

  if (error) throw new Error(error.message);
  return data as ChapterTranslationRow[];
}

// ─── Mutations ────────────────────────────────────────────────

/**
 * Upsert a published translation.
 * Uses the unique constraint (chapter_id, page_index, region_hash) for conflict resolution.
 * Only succeeds for translator + chapter owner via RLS.
 */
export async function upsertChapterTranslation(
  input: UpsertChapterTranslationInput,
): Promise<ChapterTranslationRow> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated.');

  const { data, error } = await supabase
    .from('chapter_translations')
    .upsert(
      {
        chapter_id: input.chapter_id,
        page_index: input.page_index,
        region: input.region,
        region_hash: input.region_hash,
        ocr_text: input.ocr_text.trim(),
        translated: input.translated,
        romaji: input.romaji ?? null,
        created_by: user.id,
      },
      { onConflict: 'chapter_id,page_index,region_hash' },
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data as ChapterTranslationRow;
}

/** Delete a published translation by id. Only succeeds for translator chapter owner via RLS. */
export async function deleteChapterTranslation(id: string): Promise<void> {
  if (!id) throw new TypeError('id must be a non-empty string');

  const { error } = await supabase
    .from('chapter_translations')
    .delete()
    .eq('id', id);

  if (error) throw new Error(error.message);
}
