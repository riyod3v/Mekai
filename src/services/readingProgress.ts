import { supabase } from '@/lib/supabase';
import type { ReadingProgressRow } from '@/types';

// ─── Queries ─────────────────────────────────────────────────

/** Fetch reading progress for the signed-in user on a given chapter. */
export async function fetchReadingProgress(
  chapterId: string,
): Promise<ReadingProgressRow | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('reading_progress')
    .select('*')
    .eq('user_id', user.id)
    .eq('chapter_id', chapterId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data as ReadingProgressRow | null;
}

// ─── Mutations ────────────────────────────────────────────────

/**
 * Upsert reading progress. Uses the composite PK (user_id, chapter_id)
 * for on-conflict resolution.
 */
export async function upsertReadingProgress(
  chapterId: string,
  lastPageIndex: number,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;

  const { error } = await supabase
    .from('reading_progress')
    .upsert(
      {
        user_id: user.id,
        chapter_id: chapterId,
        last_page_index: lastPageIndex,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,chapter_id' },
    );

  if (error) {
    console.warn('[readingProgress] upsert failed:', error.message);
  }
}
