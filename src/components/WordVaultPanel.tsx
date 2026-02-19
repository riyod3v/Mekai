import { Trash2, BookOpen, Vault } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchWordVault, deleteFromWordVault } from '@/services/wordVault';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from './LoadingSpinner';
import toast from 'react-hot-toast';

export function WordVaultPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ['word-vault', user?.id],
    enabled: !!user,
    queryFn: () => fetchWordVault(user!.id),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFromWordVault,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['word-vault'] });
      toast.success('Removed from Word Vault');
    },
    onError: () => toast.error('Failed to remove entry'),
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <Vault className="h-8 w-8 text-gray-600" />
        <p className="text-sm text-gray-500">No saved words yet.</p>
        <p className="text-xs text-gray-600">Select a region while reading to OCR & save words.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="glass rounded-xl border border-white/10 p-3 flex flex-col gap-1 group"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="font-mono text-sm text-gray-100 break-words">{entry.original}</p>
              <p className="text-xs text-green-300 break-words">{entry.translated}</p>
              {entry.romaji && (
                <p className="text-xs text-blue-300 italic">{entry.romaji}</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {entry.source_page_id && (
                <button
                  title="View source page"
                  className="p-1 rounded text-gray-500 hover:text-indigo-300 transition-colors"
                >
                  <BookOpen className="h-3 w-3" />
                </button>
              )}
              <button
                onClick={() => deleteMutation.mutate(entry.id)}
                disabled={deleteMutation.isPending}
                className="p-1 rounded text-gray-500 hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}
