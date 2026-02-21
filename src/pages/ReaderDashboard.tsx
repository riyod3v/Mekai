import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Library, FolderLock } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeManga } from '@/hooks/useRealtimeManga';
import { fetchSharedManga, fetchMyPrivateManga, createManga } from '@/services/manga';
import { MangaCard } from '@/components/MangaCard';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { MangaUploadForm } from '@/components/MangaUploadForm';
import type { MangaFormData } from '@/types';

type Tab = 'shared' | 'private';

export default function ReaderDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('shared');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [search, setSearch] = useState('');

  // Realtime subscription – updates when a translator uploads
  useRealtimeManga();

  // Shared manga query
  const {
    data: sharedManga = [],
    isLoading: sharedLoading,
    error: sharedError,
    refetch: refetchShared,
  } = useQuery({
    queryKey: ['manga', 'shared'],
    queryFn: fetchSharedManga,
  });

  // Private manga query
  const {
    data: privateManga = [],
    isLoading: privateLoading,
    error: privateError,
    refetch: refetchPrivate,
  } = useQuery({
    queryKey: ['manga', 'private', user?.id],
    enabled: !!user && tab === 'private',
    queryFn: () => fetchMyPrivateManga(user!.id),
  });

  // Upload private manga mutation
  const uploadMutation = useMutation({
    mutationFn: (formData: MangaFormData) => createManga(formData, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manga', 'private'] });
      setShowUploadModal(false);
      toast.success('Manga added to your private library!');
    },
    onError: (err: Error) => toast.error(err.message ?? 'Upload failed'),
  });

  const currentManga = tab === 'shared' ? sharedManga : privateManga;
  const isLoading = tab === 'shared' ? sharedLoading : privateLoading;
  const hasError = tab === 'shared' ? sharedError : privateError;

  const filtered = currentManga.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Library</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Browse and read manga</p>
        </div>
        {tab === 'private' && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="sm:ml-auto flex items-center gap-2 px-4 py-2 rounded-xl mekai-primary-bg hover:opacity-90 text-white text-sm font-medium transition-opacity"
          >
            <Plus className="h-4 w-4" />
            Add Private Manga
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 glass rounded-xl p-1 w-fit">
        {([
          { id: 'shared', label: 'Shared Library', icon: Library },
          { id: 'private', label: 'My Private Uploads', icon: FolderLock },
        ] as { id: Tab; label: string; icon: React.FC<{ className?: string }> }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
              tab === id ? 'mekai-primary-bg text-white' : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-6">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search manga…"
          className="w-full sm:max-w-xs px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/15 text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
        />
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner size="lg" />
        </div>
      ) : hasError ? (
        <ErrorState
          message={(hasError as Error).message}
          retry={tab === 'shared' ? refetchShared : refetchPrivate}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title={search ? 'No results found' : tab === 'shared' ? 'No shared manga yet' : 'No private manga yet'}
          message={
            search
              ? 'Try a different search term.'
              : tab === 'shared'
              ? 'Nothing in the shared library yet. Check back later!'
              : 'Add your own private manga to read for yourself.'
          }
          action={
            tab === 'private' && !search
              ? { label: 'Add Private Manga', onClick: () => setShowUploadModal(true) }
              : undefined
          }
        />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filtered.map((manga) => (
            <MangaCard key={manga.id} manga={manga} showVisibility={tab === 'private'} />
          ))}
        </div>
      )}

      {/* Upload Private Manga Modal */}
      <Modal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Add Private Manga"
      >
        <MangaUploadForm
          defaultVisibility="private"
          onSubmit={(data) => uploadMutation.mutateAsync(data)}
          submitLabel="Add to My Library"
        />
      </Modal>
    </div>
  );
}
