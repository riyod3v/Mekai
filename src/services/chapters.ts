import { supabase, BUCKETS } from '@/lib/supabase';
import type { Chapter, Page, ChapterFormData } from '@/types';
import { v4 as uuidv4 } from '@/lib/uuid';

// ─── Queries ────────────────────────────────────────────────

export async function fetchChaptersByManga(mangaId: string): Promise<Chapter[]> {
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('manga_id', mangaId)
    .order('chapter_number', { ascending: true });
  if (error) throw error;
  return data as Chapter[];
}

export async function fetchChapterById(chapterId: string): Promise<Chapter> {
  const { data, error } = await supabase
    .from('chapters')
    .select('*')
    .eq('id', chapterId)
    .single();
  if (error) throw error;
  return data as Chapter;
}

export async function fetchPagesByChapter(chapterId: string): Promise<Page[]> {
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('page_number', { ascending: true });
  if (error) throw error;
  return data as Page[];
}

// ─── Mutations ───────────────────────────────────────────────

export async function uploadChapter(
  formData: ChapterFormData,
  mangaId: string,
  uploaderId: string,
  onProgress?: (uploaded: number, total: number) => void
): Promise<{ chapter: Chapter; pages: Page[] }> {
  // 1. Upsert chapter record
  const { data: chapterData, error: chapterErr } = await supabase
    .from('chapters')
    .upsert(
      {
        manga_id: mangaId,
        chapter_number: formData.chapterNumber,
        title: formData.title || null,
        uploaded_by: uploaderId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'manga_id,chapter_number' }
    )
    .select()
    .single();
  if (chapterErr) throw chapterErr;
  const chapter = chapterData as Chapter;

  // 2. Delete old pages for this chapter (re-upload scenario)
  await supabase.from('pages').delete().eq('chapter_id', chapter.id);

  // 3. Upload each page image to storage + insert page records
  const sortedFiles = [...formData.pages].sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { numeric: true })
  );

  const pageInserts: Omit<Page, 'created_at'>[] = [];

  for (let i = 0; i < sortedFiles.length; i++) {
    const file = sortedFiles[i];
    const ext = file.name.split('.').pop();
    const storagePath = `${uploaderId}/${mangaId}/${chapter.id}/${i + 1}-${uuidv4()}.${ext}`;

    const { error: uploadErr } = await supabase.storage
      .from(BUCKETS.PAGES)
      .upload(storagePath, file, { upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage
      .from(BUCKETS.PAGES)
      .getPublicUrl(storagePath);

    pageInserts.push({
      id: uuidv4(),
      chapter_id: chapter.id,
      page_number: i + 1,
      image_url: urlData.publicUrl,
    });

    onProgress?.(i + 1, sortedFiles.length);
  }

  const { data: pagesData, error: pagesErr } = await supabase
    .from('pages')
    .insert(pageInserts)
    .select();
  if (pagesErr) throw pagesErr;

  return { chapter, pages: pagesData as Page[] };
}

/**
 * Upload a single .cbz/.zip archive for a chapter.
 * Upserts the chapter record and stores the public URL in the `cbz_url` column.
 */
export async function uploadCbzChapter(
  formData: ChapterFormData,
  mangaId: string,
  uploaderId: string
): Promise<{ chapter: Chapter }> {
  if (!formData.cbzFile) throw new Error('No .cbz file provided.');

  // Verify ownership before any insert — prevents RLS "new row violates
  // row-level security policy" errors when the caller is not the manga owner.
  const { data: mangaRow, error: mangaFetchErr } = await supabase
    .from('manga')
    .select('owner_id')
    .eq('id', mangaId)
    .single();
  if (mangaFetchErr || !mangaRow) {
    throw new Error('Manga not found or access denied.');
  }
  if (mangaRow.owner_id !== uploaderId) {
    throw new Error('You do not have permission to upload chapters to this manga.');
  }

  const ext = formData.cbzFile.name.split('.').pop() ?? 'cbz';
  const storagePath = `${uploaderId}/${mangaId}/${formData.chapterNumber}-${uuidv4()}.${ext}`;

  // Upload the archive
  const { error: uploadErr } = await supabase.storage
    .from(BUCKETS.CHAPTERS)
    .upload(storagePath, formData.cbzFile, { upsert: true });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = supabase.storage
    .from(BUCKETS.CHAPTERS)
    .getPublicUrl(storagePath);

  // Upsert the chapter record
  const { data: chapterData, error: chapterErr } = await supabase
    .from('chapters')
    .upsert(
      {
        manga_id: mangaId,
        chapter_number: formData.chapterNumber,
        title: formData.title || null,
        uploaded_by: uploaderId,
        cbz_url: urlData.publicUrl,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'manga_id,chapter_number' }
    )
    .select()
    .single();
  if (chapterErr) throw new Error(chapterErr.message);

  return { chapter: chapterData as Chapter };
}

export async function deleteChapter(chapterId: string): Promise<void> {
  const { error } = await supabase.from('chapters').delete().eq('id', chapterId);
  if (error) throw error;
}

// ─── Canonical aliases ───────────────────────────────────────

/** List chapters for a manga, ordered by chapter number. */
export async function listChapters(mangaId: string): Promise<Chapter[]> {
  return fetchChaptersByManga(mangaId);
}

/** Create a single chapter record (without page uploads). */
export async function createChapter(
  mangaId: string,
  payload: { chapter_number: number; title?: string | null; uploaded_by: string }
): Promise<Chapter> {
  const { data, error } = await supabase
    .from('chapters')
    .insert({
      manga_id: mangaId,
      chapter_number: payload.chapter_number,
      title: payload.title ?? null,
      uploaded_by: payload.uploaded_by,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Chapter;
}
