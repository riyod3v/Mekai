import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { Profile, Role } from '@/types';
import { useAuth } from './useAuth';

export function useProfile() {
  const { user } = useAuth();

  return useQuery<Profile | null>({
    queryKey: ['profile', user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (error) throw error;
      return data as Profile;
    },
    staleTime: 1000 * 60 * 5, // 5 min
  });
}

export function useRole(): { role: Role | null; isTranslator: boolean; isReader: boolean; isLoading: boolean } {
  const { data: profile, isLoading } = useProfile();

  return {
    role: profile?.role ?? null,
    isTranslator: profile?.role === 'translator',
    isReader: profile?.role === 'reader',
    isLoading,
  };
}
