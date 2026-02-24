import { supabase } from '@/lib/supabase';
import type { Chapter, ChapterFormData } from '@/types';

// ─── Queries ─────────────────────────────────────────────────

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

/** Get the total number of chapters for a manga */
export async function fetchChapterCount(mangaId: string): Promise<number> {
  const { count, error } = await supabase
    .from('chapters')
    .select('*', { count: 'exact', head: true })
    .eq('manga_id', mangaId);

  if (error) throw error;
  return count ?? 0;
}

// ─── Mutations ────────────────────────────────────────────────

/**
 * Upload a .cbz file for a chapter.
 * Reads the current session user – no caller-supplied uploader ID.
 * Storage path: [owner_id]/[manga_id]/[chapter_number].cbz
 */
export async function uploadChapterCbz(
  file: File,
  mangaId: string,
  chapterNum: number,
  title: string
): Promise<Chapter> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // 1. Storage path
  const filePath = `${user.id}/${mangaId}/${chapterNum}.cbz`;

  // 2. Upload to the 'chapters' storage bucket
  const { error: storageErr } = await supabase.storage
    .from('chapters')
    .upload(filePath, file, { upsert: true });
  if (storageErr) throw storageErr;

  // 3. Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('chapters')
    .getPublicUrl(filePath);

  // 4. Insert into chapters table (owner_id must match auth.uid() for RLS)
  const { data, error: dbErr } = await supabase
    .from('chapters')
    .insert({
      manga_id: mangaId,
      chapter_number: chapterNum,
      title: title.trim() || null,
      cbz_url: publicUrl,
      owner_id: user.id,
    })
    .select()
    .single();

  if (dbErr) {
    if (dbErr.code === '23505') {
      throw new Error(`Chapter ${chapterNum} already exists. Use Edit/Replace instead.`);
    }
    throw dbErr;
  }
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