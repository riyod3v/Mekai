import { supabase } from '@/lib/supabase';

const BUCKET = 'covers';

function coverPath(userId: string, mangaId: string): string {
  return `${userId}/manga/${mangaId}/cover.png`;
}

/**
 * Upload (or replace) a manga cover image.
 * Returns the public URL of the uploaded file.
 */
const ALLOWED_COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export async function uploadMangaCover({
  userId,
  mangaId,
  file,
}: {
  userId: string;
  mangaId: string;
  file: File;
}): Promise<string> {
  if (!ALLOWED_COVER_TYPES.includes(file.type)) {
    throw new Error('Cover image must be a JPEG, PNG, WebP, or GIF file.');
  }

  const path = coverPath(userId, mangaId);

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true, contentType: file.type });

  if (uploadError) throw new Error(`Cover upload failed: ${uploadError.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Delete a manga cover from storage.
 * Ignores "not found" errors so callers can always call this safely.
 */
export async function deleteMangaCover({
  userId,
  mangaId,
}: {
  userId: string;
  mangaId: string;
}): Promise<void> {
  const path = coverPath(userId, mangaId);

  const { error } = await supabase.storage.from(BUCKET).remove([path]);

  // Ignore "not found" — treat as success
  if (error && !error.message.toLowerCase().includes('not found')) {
    throw new Error(`Cover delete failed: ${error.message}`);
  }
}
