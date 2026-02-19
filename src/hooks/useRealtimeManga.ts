import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

/**
 * Subscribes to real-time changes on the `manga` and `chapters` tables.
 * On any change, it invalidates TanStack Query caches so the UI refreshes
 * automatically on the Reader Dashboard when translators upload/update content.
 */
export function useRealtimeManga() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel('mekai-realtime')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'manga' },
        () => {
          queryClient.invalidateQueries({ queryKey: ['manga'] });
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chapters' },
        (payload) => {
          queryClient.invalidateQueries({ queryKey: ['chapters'] });
          // Also invalidate the specific manga's chapter list
          const mangaId =
            (payload.new as { manga_id?: string })?.manga_id ??
            (payload.old as { manga_id?: string })?.manga_id;
          if (mangaId) {
            queryClient.invalidateQueries({ queryKey: ['chapters', mangaId] });
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
