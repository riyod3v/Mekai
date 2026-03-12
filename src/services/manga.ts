import { supabase } from '@/lib/supabase';
import type { Manga, MangaFormData } from '@/types';
import { uploadMangaCover } from '@/services/storageCovers';

// ─── Queries ────────────────────────────────────────────────

/** Normalise the Supabase count-join shape into chapter_count */
function normalise(row: Record<string, unknown>): Manga {
  const raw = row as unknown as Manga & { chapters?: { count: number }[] };
  const chapter_count = raw.chapters?.[0]?.count ?? 0;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { chapters: _c, ...rest } = raw;
  return { ...rest, chapter_count } as Manga;
}

/** Fetch all shared manga (for Reader dashboard shared library) */
export async function fetchSharedManga(): Promise<Manga[]> {
  const { data, error } = await supabase
    .from('manga')
    .select('*, chapters(count)')
    .eq('visibility', 'shared')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as Record<string, unknown>[]).map(normalise);
}

/** Fetch private manga owned by the current user */
export async function fetchMyPrivateManga(userId: string): Promise<Manga[]> {
  const { data, error } = await supabase
    .from('manga')
    .select('*, chapters(count)')
    .eq('visibility', 'private')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as Record<string, unknown>[]).map(normalise);
}

/** Fetch a single manga by id */
export async function fetchMangaById(id: string): Promise<Manga> {
  const { data, error } = await supabase
    .from('manga')
    .select('*, chapters(count)')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error('Manga not found or you do not have access to it.');
  return normalise(data as Record<string, unknown>);
}

/** Fetch shared manga created by a specific translator (for translator dashboard) */
export async function fetchMangaByOwner(ownerId: string): Promise<Manga[]> {
  const { data, error } = await supabase
    .from('manga')
    .select('*, chapters(count)')
    .eq('owner_id', ownerId)
    .eq('visibility', 'shared')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return (data as Record<string, unknown>[]).map(normalise);
}

// ─── Mutations ───────────────────────────────────────────────

export async function createManga(
  formData: MangaFormData,
  ownerId: string
): Promise<Manga> {
  // 1) Insert with cover_url=null first so we have the manga id
  const { data: inserted, error: insertErr } = await supabase
    .from('manga')
    .insert({
      title: formData.title,
      description: formData.description || null,
      visibility: formData.visibility,
      cover_url: null,
      owner_id: ownerId,
      genres: formData.genres ?? [],
    })
    .select()
    .single();
  if (insertErr) throw new Error(insertErr.message);
  const manga = inserted as Manga;

  // 2) If a cover was supplied, upload to proper path and update the row
  if (formData.cover) {
    const publicUrl = await uploadMangaCover({
      userId: ownerId,
      mangaId: manga.id,
      file: formData.cover,
    });
    const { data: updated, error: updateErr } = await supabase
      .from('manga')
      .update({ cover_url: publicUrl })
      .eq('id', manga.id)
      .select()
      .single();
    if (updateErr) throw new Error(updateErr.message);
    return updated as Manga;
  }

  return manga;
}

export async function updateManga(
  id: string,
  patch: Partial<Pick<Manga, 'title' | 'description' | 'cover_url' | 'genres'>>,
  ownerId: string,
  newCover?: File
): Promise<Manga> {
  let cover_url = patch.cover_url;

  if (newCover) {
    cover_url = await uploadMangaCover({ userId: ownerId, mangaId: id, file: newCover });
  }

  const { data, error } = await supabase
    .from('manga')
    .update({ ...patch, cover_url, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as Manga;
}

export async function deleteManga(id: string): Promise<void> {
  const { error } = await supabase.from('manga').delete().eq('id', id);
  if (error) throw error;
}

/** Touch a manga's updated_at timestamp (used to propagate realtime updates). */
export async function touchManga(id: string): Promise<void> {
  const { error } = await supabase
    .from('manga')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
