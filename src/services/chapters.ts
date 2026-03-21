import { supabase } from '@/lib/supabase';
import type { Chapter, ChapterFormData } from '@/types';

/** Fetch all chapters for a manga, ordered by chapter number */
export async function fetchChaptersByManga(mangaId: string): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('manga_id', mangaId)
    .order('chapter_number', { ascending: true });

  if (error) throw error;
  return data as Chapter[];
}

/** Fetch a single chapter by its ID */
export async function fetchChapterById(id: string): Promise<Chapter> {
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Chapter not found.');
  return data as Chapter;
}

async function uploadChapterCbz(
  file: File,
  mangaId: string,
  chapterNum: number,
  title: string
): Promise<Chapter> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const filePath = `${user.id}/${mangaId}/${chapterNum}.cbz`;

  const { error: storageErr } = await supabase.storage
    .from('chapters')
    .upload(filePath, file, { upsert: true });
  if (storageErr) throw storageErr;

  const { data: { publicUrl } } = supabase.storage
    .from('chapters')
    .getPublicUrl(filePath);

  const { data, error: dbErr } = await supabase
    .from('chapters')
    .upsert(
      {
        manga_id: mangaId,
        chapter_number: chapterNum,
        title: title.trim() || null,
        cbz_url: publicUrl,
        owner_id: user.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'manga_id,chapter_number' }
    )
    .select()
    .single();

  if (dbErr) throw dbErr;
  return data as Chapter;
}

/**
 * Convenience wrapper used by the chapter upload modal.
 * Reads cbzFile from ChapterFormData and returns { chapter }.
 */
export async function uploadChapter(
  data: ChapterFormData,
  mangaId: string
): Promise<{ chapter: Chapter }> {
  const chapter = await uploadChapterCbz(
    data.cbzFile,
    mangaId,
    data.chapterNumber,
    data.title
  );
  return { chapter };
}

/** Touch a chapter's updated_at timestamp (used to propagate realtime updates). */
export async function touchChapter(id: string): Promise<void> {
  const { error } = await supabase
    .from('chapters')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}