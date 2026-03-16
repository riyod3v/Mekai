import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { logger } from '@/lib/utils/logger';
import { Vault, Trash2, Search, Volume2, Sparkles, X } from 'lucide-react';
import { useNotification } from '@/context/NotificationContext';
import { useAuth } from '@/hooks/useAuth';
import { fetchWordVault, deleteFromWordVault } from '@/services/wordVault';
import { LoadingSpinner } from '@/ui/components/LoadingSpinner';
import { EmptyState } from '@/ui/components/EmptyState';
import { formatDate } from '@/lib/utils/dateUtils';
import { generateWordExplanation, isVocabAIConfigured } from '@/lib/api/vocabAI';
import { Modal } from '@/ui/components/Modal';

export default function WordVaultPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const notify = useNotification();
  const [search, setSearch] = useState('');
  const [selectedWord, setSelectedWord] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  // Real-time sync: invalidate when the user's word_vault rows change
  // (covers saves made from MangaReaderPage in another tab, cross-device, etc.)
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`word-vault-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'word_vault', filter: `user_id=eq.${user.id}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['word-vault'] });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [user, queryClient]);

  const handleSpeak = useCallback((text: string) => {
    try {
      if ('speechSynthesis' in window && text) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      logger.warn('[WordVaultPage] Text-to-speech not available:', error);
    }
  }, []);

  const handleExplainWord = useCallback(async (word: string) => {
    if (!isVocabAIConfigured()) {
      notify.error('AI explanation not configured');
      return;
    }

    setSelectedWord(word);
    setAiExplanation(null);
    setIsExplaining(true);

    try {
      const explanation = await generateWordExplanation(word);
      setAiExplanation(explanation);
    } catch (error) {
      logger.error('[WordVaultPage] AI explanation failed:', error);
      notify.error('AI explanation unavailable');
      setSelectedWord(null);
    } finally {
      setIsExplaining(false);
    }
  }, [notify]);

  const closeExplanationModal = useCallback(() => {
    setSelectedWord(null);
    setAiExplanation(null);
    setIsExplaining(false);
  }, []);

  const {
    data: entries = [],
    isLoading,
  } = useQuery({
    queryKey: ['word-vault', user?.id],
    enabled: !!user,
    queryFn: () => fetchWordVault(),
    staleTime: 0,         // always refetch on mount so vault is up-to-date
    refetchOnMount: true, // ensure data fetches even when navigating from reader
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFromWordVault,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['word-vault'] });
      notify.success('Entry removed');
    },
    onError: () => notify.error('Failed to remove entry'),
  });

  const filtered = entries.filter(
    (e) =>
      e.original.toLowerCase().includes(search.toLowerCase()) ||
      e.translated.toLowerCase().includes(search.toLowerCase()) ||
      (e.romaji ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Vault className="h-6 w-6 text-indigo-400" />
            Word Vault
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {entries.length} saved {entries.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>

        {/* Search */}
        <div className="sm:ml-auto relative">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-9 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/15 text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors w-56"
          />
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : entries.length === 0 ? (
        <EmptyState
          title="Your Word Vault is empty"
          message="While reading manga, select a speech bubble region to OCR and translate it, then save the result here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState title="No matches" message="Try a different search term." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((entry) => (
            <div
              key={entry.id}
              className="glass rounded-xl p-4 flex flex-col gap-2 group hover:border-indigo-500/30 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-base text-slate-800 dark:text-gray-100 break-words leading-snug">
                    {entry.original}
                  </p>
                </div>
                <div className="shrink-0 flex items-center gap-1">
                  {isVocabAIConfigured() && (
                    <button
                      onClick={() => handleExplainWord(entry.original)}
                      className="p-1.5 rounded-lg text-slate-400 dark:text-gray-600 hover:text-purple-400 hover:bg-purple-400/10 opacity-0 group-hover:opacity-100 transition-all"
                      title="AI Explanation"
                    >
                      <Sparkles className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {entry.romaji && (
                    <button
                      onClick={() => handleSpeak(entry.romaji!)}
                      className="p-1.5 rounded-lg text-slate-400 dark:text-gray-600 hover:text-indigo-400 hover:bg-indigo-400/10 opacity-0 group-hover:opacity-100 transition-all"
                      title="Pronounce"
                    >
                      <Volume2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => deleteMutation.mutate(entry.id)}
                    disabled={deleteMutation.isPending}
                    className="p-1.5 rounded-lg text-slate-400 dark:text-gray-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                    title="Remove from vault"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {entry.translated && (
                <p className="text-sm text-green-600 dark:text-green-300 break-words">{entry.translated}</p>
              )}

              {entry.romaji && (
                <p className="text-xs text-blue-600 dark:text-blue-300 italic">{entry.romaji}</p>
              )}

              <p className="text-xs text-slate-500 dark:text-gray-600 mt-auto pt-2 border-t border-slate-100 dark:border-white/5">
                {formatDate(entry.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* AI Explanation Modal */}
      {selectedWord && (
        <Modal
          open={true}
          onClose={closeExplanationModal}
          title="AI Explanation"
        >
          <div className="space-y-4">
            <div className="flex items-center gap-2 bg-slate-50 dark:bg-gray-800 rounded-lg p-4">
              <Sparkles className="h-5 w-5 text-purple-500 shrink-0" />
              <p className="font-mono text-lg text-slate-900 dark:text-gray-100">
                {selectedWord}
              </p>
            </div>

            {isExplaining ? (
              <div className="flex items-center justify-center py-8">
                <LoadingSpinner size="md" />
                <span className="ml-3 text-sm text-gray-500">Generating explanation...</span>
              </div>
            ) : aiExplanation ? (
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap leading-relaxed">
                  {aiExplanation}
                </div>
              </div>
            ) : null}

            <div className="flex justify-end pt-2">
              <button
                onClick={closeExplanationModal}
                className="px-4 py-2 bg-slate-100 dark:bg-gray-800 text-slate-700 dark:text-gray-300 rounded-lg hover:bg-slate-200 dark:hover:bg-gray-700 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
