import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Vault, Trash2, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/hooks/useAuth';
import { fetchWordVault, deleteFromWordVault } from '@/services/wordVault';
import { LoadingSpinner } from '@/ui/components/LoadingSpinner';
import { EmptyState } from '@/ui/components/EmptyState';
import { formatDate } from '@/lib/dateUtils';

export default function WordVaultPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const {
    data: entries = [],
    isLoading,
  } = useQuery({
    queryKey: ['word-vault', user?.id],
    enabled: !!user,
    queryFn: () => fetchWordVault(user!.id),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFromWordVault,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['word-vault'] });
      toast.success('Entry removed');
    },
    onError: () => toast.error('Failed to remove entry'),
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
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
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
            className="pl-9 pr-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-gray-100 placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors w-56"
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
              className="glass rounded-xl border border-white/10 p-4 flex flex-col gap-2 group hover:border-indigo-500/30 transition-all"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-mono text-base text-gray-100 break-words leading-snug">
                    {entry.original}
                  </p>
                </div>
                <button
                  onClick={() => deleteMutation.mutate(entry.id)}
                  disabled={deleteMutation.isPending}
                  className="shrink-0 p-1.5 rounded-lg text-gray-600 hover:text-red-400 hover:bg-red-400/10 opacity-0 group-hover:opacity-100 transition-all"
                  title="Remove from vault"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>

              {entry.translated && (
                <p className="text-sm text-green-300 break-words">{entry.translated}</p>
              )}

              {entry.romaji && (
                <p className="text-xs text-blue-300 italic">{entry.romaji}</p>
              )}

              <p className="text-xs text-gray-600 mt-auto pt-2 border-t border-white/5">
                {formatDate(entry.created_at)}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
