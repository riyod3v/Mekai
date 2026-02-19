import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Clock, Upload, ArrowLeft, Hash } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchMangaById } from '@/services/manga';
import { fetchChaptersByManga, uploadChapter } from '@/services/chapters';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorState } from '@/components/ErrorState';
import { EmptyState } from '@/components/EmptyState';
import { Modal } from '@/components/Modal';
import { ChapterUploadForm } from '@/components/ChapterUploadForm';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import { formatDistanceToNow, formatDate } from '@/lib/dateUtils';
import type { ChapterFormData } from '@/types';

const PLACEHOLDER_COVER = 'https://picsum.photos/seed/mekai-placeholder/300/420';

export default function MangaEntryPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isTranslator } = useRole();
  const queryClient = useQueryClient();
  const [showChapterModal, setShowChapterModal] = useState(false);

  const {
    data: manga,
    isLoading: mangaLoading,
    error: mangaError,
    refetch: refetchManga,
  } = useQuery({
    queryKey: ['manga', id],
    enabled: !!id,
    queryFn: () => fetchMangaById(id!),
  });

  const {
    data: chapters = [],
    isLoading: chaptersLoading,
  } = useQuery({
    queryKey: ['chapters', id],
    enabled: !!id,
    queryFn: () => fetchChaptersByManga(id!),
  });

  const uploadChapterMutation = useMutation({
    mutationFn: (data: ChapterFormData) => uploadChapter(data, id!, user!.id),
    onSuccess: ({ chapter }) => {
      queryClient.invalidateQueries({ queryKey: ['chapters', id] });
      setShowChapterModal(false);
      toast.success(`Chapter ${chapter.chapter_number} uploaded!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const canUploadChapter =
    isTranslator && manga?.owner_id === user?.id && manga?.visibility === 'shared';

  if (mangaLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (mangaError || !manga) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <ErrorState
          title="Manga not found"
          message={(mangaError as Error)?.message ?? 'This manga could not be loaded.'}
          retry={refetchManga}
        />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Back link */}
      <Link
        to={isTranslator ? '/translator' : '/reader'}
        className="inline-flex items-center gap-1.5 text-sm text-gray-400 hover:text-indigo-300 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      {/* Manga header */}
      <div className="flex flex-col sm:flex-row gap-6 mb-10">
        {/* Cover */}
        <div className="shrink-0 w-36 sm:w-44">
          <img
            src={manga.cover_url || PLACEHOLDER_COVER}
            alt={manga.title}
            className="w-full aspect-[3/4] object-cover rounded-xl shadow-2xl"
            onError={(e) => { (e.target as HTMLImageElement).src = PLACEHOLDER_COVER; }}
          />
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-3">
          {manga.visibility === 'private' && (
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 w-fit font-medium">
              Private
            </span>
          )}
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight">
            {manga.title}
          </h1>
          {manga.description && (
            <p className="text-sm text-gray-400 max-w-xl leading-relaxed">{manga.description}</p>
          )}
          <div className="flex flex-wrap gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Updated {formatDate(manga.updated_at)}
            </span>
            <span className="flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              {manga.visibility === 'shared' ? 'Shared Library' : 'Private'}
            </span>
          </div>

          {canUploadChapter && (
            <button
              onClick={() => setShowChapterModal(true)}
              className="mt-2 flex items-center gap-2 w-fit px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium transition-colors"
            >
              <Upload className="h-4 w-4" />
              Upload / Update Chapter
            </button>
          )}
        </div>
      </div>

      {/* Chapter List */}
      <div>
        <h2 className="text-lg font-semibold text-gray-100 mb-4 flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-indigo-400" />
          Chapters
        </h2>

        {chaptersLoading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : chapters.length === 0 ? (
          <EmptyState
            title="No chapters yet"
            message={
              canUploadChapter
                ? 'Upload the first chapter to get started.'
                : 'No chapters have been uploaded for this manga yet.'
            }
            action={
              canUploadChapter
                ? { label: 'Upload Chapter', onClick: () => setShowChapterModal(true) }
                : undefined
            }
          />
        ) : (
          <div className="flex flex-col gap-2">
            {chapters.map((ch) => (
              <Link
                key={ch.id}
                to={`/read/${ch.id}`}
                className="glass rounded-xl border border-white/10 hover:border-indigo-500/40 px-4 py-3 flex items-center gap-4 transition-all hover:shadow-lg group"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300 font-bold text-sm shrink-0 group-hover:bg-indigo-500/30 transition-colors">
                  {ch.chapter_number}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-100 group-hover:text-indigo-200 transition-colors">
                    Chapter {ch.chapter_number}
                    {ch.title ? ` — ${ch.title}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {formatDistanceToNow(ch.updated_at)} ago
                  </p>
                </div>
                <div className="flex items-center gap-1 text-xs text-indigo-400 group-hover:text-indigo-300 transition-colors shrink-0">
                  <BookOpen className="h-3.5 w-3.5" />
                  Read
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Upload Chapter Modal */}
      <Modal
        open={showChapterModal}
        onClose={() => setShowChapterModal(false)}
        title="Upload Chapter"
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
