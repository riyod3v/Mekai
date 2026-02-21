import { supabase } from '@/lib/supabase';
import type { Profile } from '@/types';

// ─── Queries ────────────────────────────────────────────────

/** Fetch the currently signed-in user's profile. */
export async function getMyProfile(): Promise<Profile> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!user) throw new Error('Not authenticated.');

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();
  if (error) throw new Error(error.message);
  // Attach email from auth.users (not stored in profiles table)
  return { ...(data as Profile), email: user.email };
}

// ─── Mutations ───────────────────────────────────────────────

/** Update the current user's profile. Only writable fields accepted. */
export async function updateMyProfile(
  patch: Partial<Pick<Profile, 'username' | 'avatar_url'>>
): Promise<Profile> {
  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr) throw new Error(authErr.message);
  if (!user) throw new Error('Not authenticated.');

  const { data, error } = await supabase
    .from('profiles')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', user.id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return { ...(data as Profile), email: user.email };
}
