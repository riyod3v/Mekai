import { supabase, BUCKETS } from '@/lib/supabase';
import type { Manga, MangaFormData } from '@/types';
import { v4 as uuidv4 } from '@/lib/uuid';

// ─── Queries ────────────────────────────────────────────────

/** Fetch all shared manga (for Reader dashboard shared library) */
export async function fetchSharedManga(): Promise<Manga[]> {
  const { data, error } = await supabase
    .from('manga')
    .select('*')
    .eq('visibility', 'shared')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data as Manga[];
}

/** Fetch private manga owned by the current user */
export async function fetchMyPrivateManga(userId: string): Promise<Manga[]> {
  const { data, error } = await supabase
    .from('manga')
    .select('*')
    .eq('visibility', 'private')
    .eq('owner_id', userId)
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data as Manga[];
}

/** Fetch a single manga by id */
export async function fetchMangaById(id: string): Promise<Manga> {
  const { data, error } = await supabase
    .from('manga')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data as Manga;
}

/** Fetch shared manga created by a specific translator (for translator dashboard) */
export async function fetchMangaByOwner(ownerId: string): Promise<Manga[]> {
  const { data, error } = await supabase
    .from('manga')
    .select('*')
    .eq('owner_id', ownerId)
    .eq('visibility', 'shared')
    .order('updated_at', { ascending: false });
  if (error) throw error;
  return data as Manga[];
}

// ─── Mutations ───────────────────────────────────────────────

export async function createManga(
  formData: MangaFormData,
  ownerId: string
): Promise<Manga> {
  let cover_url: string | null = null;

  if (formData.cover) {
    const ext = formData.cover.name.split('.').pop();
    const path = `${ownerId}/${uuidv4()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKETS.COVERS)
      .upload(path, formData.cover, { upsert: true });
    if (uploadErr) throw uploadErr;

    const { data: urlData } = supabase.storage
      .from(BUCKETS.COVERS)
      .getPublicUrl(path);
    cover_url = urlData.publicUrl;
  }

  const { data, error } = await supabase
    .from('manga')
    .insert({
      title: formData.title,
      description: formData.description || null,
      visibility: formData.visibility,
      cover_url,
      owner_id: ownerId,
    })
    .select()
    .single();
  if (error) throw error;
  return data as Manga;
}

export async function updateManga(
  id: string,
  patch: Partial<Pick<Manga, 'title' | 'description' | 'cover_url'>>,
  ownerId: string,
  newCover?: File
): Promise<Manga> {
  let cover_url = patch.cover_url;

  if (newCover) {
    const ext = newCover.name.split('.').pop();
    const path = `${ownerId}/${uuidv4()}.${ext}`;
    const { error: uploadErr } = await supabase.storage
      .from(BUCKETS.COVERS)
      .upload(path, newCover, { upsert: true });
    if (uploadErr) throw uploadErr;
    const { data: urlData } = supabase.storage
      .from(BUCKETS.COVERS)
      .getPublicUrl(path);
    cover_url = urlData.publicUrl;
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

// ─── Canonical aliases ───────────────────────────────────────

/**
 * List all manga readable by the current user:
 * shared manga (all authenticated) + the user's own private manga.
 */
export async function listManga(): Promise<Manga[]> {
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  const { data, error } = await supabase
    .from('manga')
    .select('*')
    .or(userId ? `visibility.eq.shared,and(visibility.eq.private,owner_id.eq.${userId})` : 'visibility.eq.shared')
    .order('updated_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data as Manga[];
}
