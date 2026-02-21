import { supabase, BUCKETS } from '@/lib/supabase';
import type { Page } from '@/types';
import { v4 as uuidv4 } from '@/lib/uuid';

// ─── Queries ────────────────────────────────────────────────

export async function listPages(chapterId: string): Promise<Page[]> {
  const { data, error } = await supabase
    .from('pages')
    .select('*')
    .eq('chapter_id', chapterId)
    .order('page_number', { ascending: true });
  if (error) throw new Error(error.message);
  return data as Page[];
}

// ─── Mutations ───────────────────────────────────────────────

export async function createPage(
  chapterId: string,
  payload: { page_number: number; file: File; uploaderId: string; mangaId: string }
): Promise<Page> {
  const ext = payload.file.name.split('.').pop();
  const storagePath = `${payload.uploaderId}/${payload.mangaId}/${chapterId}/${payload.page_number}-${uuidv4()}.${ext}`;

  const { error: uploadErr } = await supabase.storage
    .from(BUCKETS.PAGES)
    .upload(storagePath, payload.file, { upsert: true });
  if (uploadErr) throw new Error(uploadErr.message);

  const { data: urlData } = supabase.storage
    .from(BUCKETS.PAGES)
    .getPublicUrl(storagePath);

  const { data, error } = await supabase
    .from('pages')
    .insert({
      id: uuidv4(),
      chapter_id: chapterId,
      page_number: payload.page_number,
      image_url: urlData.publicUrl,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Page;
}

export async function deletePage(id: string): Promise<void> {
  const { error } = await supabase.from('pages').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
