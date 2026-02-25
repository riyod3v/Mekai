import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Library, FolderLock, BookMarked, Clock, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';
import { useAuth } from '@/hooks/useAuth';
import { useRealtimeManga } from '@/hooks/useRealtimeManga';
import { fetchSharedManga, fetchMyPrivateManga, createManga } from '@/services/manga';
import { fetchChaptersByManga, uploadChapter } from '@/services/chapters';
import { MangaCard } from '@/ui/components/MangaCard';
import { LoadingSpinner } from '@/ui/components/LoadingSpinner';
import { ErrorState } from '@/ui/components/ErrorState';
import { EmptyState } from '@/ui/components/EmptyState';
import { Modal } from '@/ui/components/Modal';
import { MangaUploadForm } from '@/ui/components/MangaUploadForm';
import { ChapterUploadForm } from '@/ui/components/ChapterUploadForm';
import { formatDistanceToNow } from '@/lib/dateUtils';
import type { Manga, ChapterFormData } from '@/types';

type Tab = 'shared' | 'private';

export default function ReaderDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('shared');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [search, setSearch] = useState('');

  // Chapter upload state (private manga only)
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null);
  const [showChapterModal, setShowChapterModal] = useState(false);

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
    mutationFn: (formData: Parameters<typeof createManga>[0]) => createManga(formData, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manga', 'private'] });
      setShowUploadModal(false);
      toast.success('Manga added to your private library!');
    },
    onError: (err: Error) => toast.error(err.message ?? 'Upload failed'),
  });

  // Chapters for the selected private manga
  const { data: chapters = [] } = useQuery({
    queryKey: ['chapters', selectedManga?.id],
    enabled: !!selectedManga,
    queryFn: () => fetchChaptersByManga(selectedManga!.id),
  });

  // Upload chapter mutation (private manga)
  const uploadChapterMutation = useMutation({
    mutationFn: (data: ChapterFormData) =>
      uploadChapter(data, selectedManga!.id),
    onSuccess: ({ chapter }) => {
      queryClient.invalidateQueries({ queryKey: ['chapters', selectedManga!.id] });
      setShowChapterModal(false);
      toast.success(`Chapter ${chapter.chapter_number} uploaded!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const currentManga = tab === 'shared' ? sharedManga : privateManga;
  const isLoading = tab === 'shared' ? sharedLoading : privateLoading;
  const hasError = tab === 'shared' ? sharedError : privateError;

  const filtered = currentManga.filter((m) =>
    m.title.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-8">
      <div className="flex-1 min-w-0">
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
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-white/5 backdrop-blur-md rounded-xl p-1 w-fit border border-gray-200 dark:border-transparent">
        {([
          { id: 'shared', label: 'Online Library', icon: Library },
          { id: 'private', label: 'My Private Uploads', icon: FolderLock },
        ] as { id: Tab; label: string; icon: React.FC<{ className?: string }> }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); setSelectedManga(null); }}
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
          title={search ? 'No results found' : tab === 'shared' ? 'No published manga yet' : 'No private manga yet'}
          message={
            search
              ? 'Try a different search term.'
              : tab === 'shared'
              ? 'Nothing in the online library yet. Check back later!'
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
            <div
              key={manga.id}
              onClick={tab === 'private' ? () => setSelectedManga(manga) : undefined}
              className={tab === 'private' ? 'cursor-pointer' : undefined}
            >
              <MangaCard manga={manga} showVisibility={tab === 'private'} />
            </div>
          ))}
        </div>
      )}
      </div>

      {/* Right column – Chapter manager for selected private manga */}
      {tab === 'private' && selectedManga && (
        <div className="w-full lg:w-80 shrink-0">
          <div className="bg-white dark:bg-white/5 backdrop-blur-md rounded-2xl border border-gray-200 dark:border-white/10 p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-xs text-slate-400 dark:text-gray-500 uppercase tracking-wide font-medium mb-1 flex items-center gap-1">
                  <BookMarked className="h-3 w-3" />
                  Chapters
                </p>
                <h2 className="font-semibold text-slate-900 dark:text-gray-100 text-sm line-clamp-2">
                  {selectedManga.title}
                </h2>
              </div>
              <button
                onClick={() => setSelectedManga(null)}
                className="text-slate-400 dark:text-gray-500 hover:text-slate-900 dark:hover:text-white text-xs"
              >
                ✕
              </button>
            </div>

            <button
              onClick={() => setShowChapterModal(true)}
              className="w-full flex items-center justify-center gap-2 mb-4 py-2 rounded-xl border border-dashed border-indigo-500/40 hover:border-indigo-500 text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
            >
              <Upload className="h-4 w-4" />
              Upload / Update Chapter
            </button>

            {chapters.length === 0 ? (
              <p className="text-sm text-slate-400 dark:text-gray-500 text-center py-4">No chapters uploaded yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {chapters.map((ch) => (
                  <li key={ch.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10">
                    <div>
                      <p className="text-sm text-slate-800 dark:text-gray-200 font-medium">
                        Ch. {ch.chapter_number}
                        {ch.title ? ` — ${ch.title}` : ''}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-gray-500 flex items-center gap-1 mt-0.5">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(ch.updated_at)} ago
                      </p>
                    </div>
                    <span className="text-xs text-indigo-400 font-medium">
                      #{ch.chapter_number}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Upload Private Manga Modal */}
      <Modal
        open={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        title="Add Private Manga"
      >
        <MangaUploadForm
          onSubmit={(data) => uploadMutation.mutateAsync(data)}
          submitLabel="Add to My Library"
        />
      </Modal>

      {/* Upload Chapter Modal (private manga) */}
      <Modal
        open={showChapterModal}
        onClose={() => setShowChapterModal(false)}
        title={`Upload Chapter — ${selectedManga?.title ?? ''}`}
        maxWidth="max-w-2xl"
      >
        <ChapterUploadForm
          onSubmit={(data) => uploadChapterMutation.mutateAsync(data)}
          submitLabel="Upload Chapter"
        />
      </Modal>
    </div>
  );
}
