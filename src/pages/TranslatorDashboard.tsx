import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, BookMarked, Clock, Upload } from 'lucide-react';
import { useNotification } from '@/context/NotificationContext';
import { useAuth } from '@/hooks/useAuth';
import { fetchMangaByOwner, createManga } from '@/services/manga';
import { fetchChaptersByManga, uploadChapter } from '@/services/chapters';
import { MangaCard } from '@/ui/components/MangaCard';
import { LoadingSpinner } from '@/ui/components/LoadingSpinner';
import { ErrorState } from '@/ui/components/ErrorState';
import { EmptyState } from '@/ui/components/EmptyState';
import { Modal } from '@/ui/components/Modal';
import { MangaUploadForm } from '@/ui/components/MangaUploadForm';
import { ChapterUploadForm } from '@/ui/components/ChapterUploadForm';
import { formatDistanceToNow } from '@/lib/dateUtils';
import type { Manga, ChapterFormData, MangaFormData } from '@/types';

export default function TranslatorDashboard() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const [showMangaModal, setShowMangaModal] = useState(false);
  const [selectedManga, setSelectedManga] = useState<Manga | null>(null);
  const [showChapterModal, setShowChapterModal] = useState(false);
  const notify = useNotification();

  // All shared manga owned by this translator
  const {
    data: myManga = [],
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ['manga', 'owned', user?.id],
    enabled: !!user,
    queryFn: () => fetchMangaByOwner(user!.id),
  });

  // Chapters for the selected manga (for the chapter list)
  const { data: chapters = [] } = useQuery({
    queryKey: ['chapters', selectedManga?.id],
    enabled: !!selectedManga,
    queryFn: () => fetchChaptersByManga(selectedManga!.id),
  });

  const createMangaMutation = useMutation({
    mutationFn: (data: MangaFormData) => createManga(data, user!.id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manga', 'owned'] });
      setShowMangaModal(false);
      notify.success('Manga created and added to shared library!');
    },
    onError: (err: Error) => notify.error(err.message),
  });

  const uploadChapterMutation = useMutation({
    mutationFn: (data: ChapterFormData) =>
      uploadChapter(data, selectedManga!.id),
    onSuccess: ({ chapter }) => {
      queryClient.invalidateQueries({ queryKey: ['chapters', selectedManga!.id] });
      setShowChapterModal(false);
      notify.success(`Chapter ${chapter.chapter_number} uploaded!`);
    },
    onError: (err: Error) => notify.error(err.message),
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 flex flex-col lg:flex-row gap-8">
      {/* Left column – Manga list */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Translator Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Manage your shared manga</p>
          </div>
          <button
            onClick={() => setShowMangaModal(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl mekai-primary-bg hover:opacity-90 text-white text-sm font-medium transition-opacity"
          >
            <Plus className="h-4 w-4" />
            New Manga
          </button>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : error ? (
          <ErrorState message={(error as Error).message} retry={refetch} />
        ) : myManga.length === 0 ? (
          <EmptyState
            title="No shared manga yet"
            message="Create your first manga to share with readers."
            action={{ label: 'Create Manga', onClick: () => setShowMangaModal(true) }}
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {myManga.map((manga) => (
              <div key={manga.id} onClick={() => setSelectedManga(manga)} className="cursor-pointer">
                <MangaCard manga={manga} showVisibility />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Right column – Chapter manager for selected manga */}
      {selectedManga && (
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

      {/* Create Manga Modal */}
      <Modal
        open={showMangaModal}
        onClose={() => setShowMangaModal(false)}
        title="Create Shared Manga"
      >
        <MangaUploadForm
          onSubmit={(data) => createMangaMutation.mutateAsync(data)}
          submitLabel="Create & Share"
        />
      </Modal>

      {/* Upload Chapter Modal */}
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
