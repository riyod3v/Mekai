import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  fetchTranslationHistoryByChapter,
  createTranslationHistory,
  deleteTranslationHistory,
} from '@/lib/translationHistory';
import type { TranslationHistoryRow, CreateTranslationHistoryInput, RegionBox } from '@/types';

// Re-export the params type so callers don't need to import from lib
export interface AddHistoryParams {
  mangaId: string;
  chapterId: string;
  pageIndex: number;
  region: RegionBox;
  ocrText: string;
  translated: string;
  romaji?: string | null;
}

// ─── Query key factory ────────────────────────────────────────

export const historyKeys = {
  byChapter: (chapterId: string) => ['translation_history', chapterId] as const,
};

// ─── Hooks ───────────────────────────────────────────────────

/**
 * Fetch translation history for a chapter (newest first).
 * Skips the query when chapterId is empty/falsy.
 */
export function useTranslationHistory(chapterId: string) {
  return useQuery<TranslationHistoryRow[], Error>({
    queryKey: historyKeys.byChapter(chapterId),
    queryFn: () => fetchTranslationHistoryByChapter(chapterId),
    enabled: Boolean(chapterId),
  });
}

/** Insert a new translation history row, then invalidate the chapter list. */
export function useAddTranslationHistory() {
  const queryClient = useQueryClient();

  return useMutation<TranslationHistoryRow, Error, AddHistoryParams>({
    mutationFn: (params) =>
      createTranslationHistory({
        manga_id: params.mangaId,
        chapter_id: params.chapterId,
        page_index: params.pageIndex,
        region: params.region,
        ocr_text: params.ocrText,
        translated: params.translated,
        romaji: params.romaji ?? null,
      } satisfies CreateTranslationHistoryInput),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({
        queryKey: historyKeys.byChapter(variables.chapterId),
      });
    },
  });
}

/** Delete a translation history row by id, then invalidate the chapter list. */
export function useDeleteTranslationHistory(chapterId: string) {
  const queryClient = useQueryClient();

  return useMutation<void, Error, string>({
    mutationFn: deleteTranslationHistory,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: historyKeys.byChapter(chapterId),
      });
    },
  });
}

