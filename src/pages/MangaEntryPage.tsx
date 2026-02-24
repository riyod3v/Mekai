import { useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Clock, Upload, ArrowLeft, Hash, Pencil, Trash2, ImageIcon, X } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchMangaById, updateManga, deleteManga } from '@/services/manga';
import { deleteMangaCover } from '@/services/storageCovers';
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

export default function MangaEntryPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isTranslator } = useRole();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showChapterModal, setShowChapterModal] = useState(false);

  // Edit state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editGenres, setEditGenres] = useState<string[]>([]);
  const [editCoverFile, setEditCoverFile] = useState<File | null>(null);
  const [editCoverPreview, setEditCoverPreview] = useState<string | null>(null);
  const [removeCover, setRemoveCover] = useState(false);
  const editCoverRef = useRef<HTMLInputElement>(null);
  const [editGenreInput, setEditGenreInput] = useState('');

  function addEditGenre(raw: string) {
    const tag = raw.trim();
    if (tag) setEditGenres((prev) => prev.includes(tag) ? prev : [...prev, tag]);
    setEditGenreInput('');
  }

  function removeEditGenre(genre: string) {
    setEditGenres((prev) => prev.filter((g) => g !== genre));
  }

  function handleEditGenreKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addEditGenre(editGenreInput);
    } else if (e.key === 'Backspace' && editGenreInput === '' && editGenres.length > 0) {
      setEditGenres((prev) => prev.slice(0, -1));
    }
  }

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

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
    mutationFn: (data: ChapterFormData) => uploadChapter(data, id!),
    onSuccess: ({ chapter }) => {
      queryClient.invalidateQueries({ queryKey: ['chapters', id] });
      setShowChapterModal(false);
      toast.success(`Chapter ${chapter.chapter_number} uploaded!`);
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const isOwner = !!user && manga?.owner_id === user.id;
  // Any owner can upload chapters — translators to shared, readers to private
  const canUploadChapter = isOwner;

  // Edit mutation
  const editMutation = useMutation({
    mutationFn: () =>
      updateManga(
        manga!.id,
        {
          title: editTitle.trim(),
          description: editDescription.trim(),
          genres: editGenres,
          ...(removeCover ? { cover_url: null } : {}),
        },
        manga!.owner_id,
        editCoverFile ?? undefined
      ),
    onSuccess: (updated) => {
      queryClient.setQueryData(['manga', id], updated);
      queryClient.invalidateQueries({ queryKey: ['manga', id] });
      setShowEditModal(false);
      setEditCoverFile(null);
      setEditCoverPreview(null);
      setRemoveCover(false);
      toast.success('Manga updated!');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async () => {
      await deleteManga(manga!.id);
      await deleteMangaCover({ userId: manga!.owner_id, mangaId: manga!.id });
    },
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['manga', id] });
      // Invalidate only the list-level queries, not the specific entry
      queryClient.invalidateQueries({ queryKey: ['manga', 'shared'] });
      queryClient.invalidateQueries({ queryKey: ['manga', 'owned'] });
      queryClient.invalidateQueries({ queryKey: ['manga', 'private'] });
      toast.success('Manga deleted.');
      navigate(isTranslator ? '/translator' : '/reader');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function openEditModal() {
    if (!manga) return;
    setEditTitle(manga.title);
    setEditDescription(manga.description ?? '');
    setEditGenres(manga.genres ?? []);
    setEditCoverFile(null);
    setEditCoverPreview(null);
    setRemoveCover(false);
    setEditGenreInput('');
    setShowEditModal(true);
  }

  function handleEditCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setEditCoverFile(file);
    setRemoveCover(false);
    if (file) setEditCoverPreview(URL.createObjectURL(file));
    else setEditCoverPreview(null);
  }

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
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors mb-6"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dashboard
      </Link>

      {/* Manga header */}
      <div className="flex flex-col sm:flex-row gap-6 mb-10">
        {/* Cover */}
        <div className="shrink-0 w-36 sm:w-44">
          {manga.cover_url ? (
            <img
              src={manga.cover_url}
              alt={manga.title}
              className="w-full aspect-[3/4] object-cover rounded-xl shadow-2xl"
            />
          ) : (
            <div className="w-full aspect-[3/4] rounded-xl bg-gray-100 dark:bg-white/5 border border-gray-300 dark:border-white/10 flex flex-col items-center justify-center gap-2">
              <ImageIcon className="h-10 w-10 text-gray-400 dark:text-gray-600" />
              <span className="text-xs text-gray-500 dark:text-gray-500 font-medium">No Cover</span>
            </div>
          )}
        </div>

        {/* Metadata */}
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">
            {manga.title}
          </h1>
          {manga.description && (
            <p className="text-sm text-gray-600 dark:text-gray-400 max-w-xl leading-relaxed">{manga.description}</p>
          )}

          {/* Genre Tags */}
          {manga.genres && manga.genres.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {manga.genres.map((genre) => (
                <span
                  key={genre}
                  className="px-2.5 py-0.5 rounded-full text-xs font-medium border bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30"
                >
                  {genre}
                </span>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-4 text-xs text-gray-500 dark:text-gray-500">
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {chapters.length} chapter{chapters.length !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Updated {formatDate(manga.updated_at)}
            </span>
            {manga.visibility === 'private' ? (
              <span className="px-1.5 py-0.5 rounded-md bg-yellow-100 dark:bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 border border-yellow-300 dark:border-yellow-400/40 font-semibold tracking-wide">
                Private
              </span>
            ) : (
              <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-400/20 text-indigo-700 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-400/40 font-semibold tracking-wide">
                Shared
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-2 mt-2">
            {canUploadChapter && (
              <button
                onClick={() => setShowChapterModal(true)}
                className="flex items-center gap-2 w-fit px-4 py-2 rounded-xl mekai-primary-bg hover:opacity-90 text-white text-sm font-medium transition-opacity"
              >
                <Upload className="h-4 w-4" />
                Upload / Update Chapter
              </button>
            )}
            {isOwner && (
              <>
                <button
                  onClick={openEditModal}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/20 text-slate-800 dark:text-gray-200 text-sm font-medium transition-colors"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </button>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 text-sm font-medium transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Chapter List */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2">
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
                className="bg-white dark:bg-white/5 backdrop-blur-md rounded-xl border border-gray-200 dark:border-white/10 hover:border-indigo-500/40 px-4 py-3 flex items-center gap-4 transition-all hover:shadow-lg group"
              >
                <div className="w-10 h-10 rounded-lg bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-300 font-bold text-sm shrink-0 group-hover:bg-indigo-200 dark:group-hover:bg-indigo-500/30 transition-colors">
                  {ch.chapter_number}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-200 transition-colors">
                    Chapter {ch.chapter_number}
                    {ch.title ? ` — ${ch.title}` : ''}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 flex items-center gap-1 mt-0.5">
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

      {/* Edit Manga Modal */}
      <Modal
        open={showEditModal}
        onClose={() => setShowEditModal(false)}
        title="Edit Manga"
      >
        <form
          onSubmit={(e) => { e.preventDefault(); editMutation.mutate(); }}
          className="flex flex-col gap-4"
        >
          {/* Cover preview / picker */}
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-24 aspect-[3/4] rounded-xl overflow-hidden bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 flex items-center justify-center">
              {removeCover ? (
                <span className="text-xs text-slate-400 dark:text-gray-500 text-center p-2">No cover</span>
              ) : editCoverPreview ? (
                <img src={editCoverPreview} alt="New cover" className="w-full h-full object-cover" />
              ) : manga?.cover_url ? (
                <img src={manga.cover_url} alt="Current cover" className="w-full h-full object-cover" />
              ) : (
                <ImageIcon className="h-6 w-6 text-slate-400 dark:text-gray-600" />
              )}
            </div>
            <div className="flex flex-col gap-2 pt-1">
              <button
                type="button"
                onClick={() => editCoverRef.current?.click()}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-gray-300 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                {editCoverFile ? 'Change' : 'Upload new cover'}
              </button>
              {(manga?.cover_url || editCoverFile) && !removeCover && (
                <button
                  type="button"
                  onClick={() => { setEditCoverFile(null); setEditCoverPreview(null); setRemoveCover(true); if (editCoverRef.current) editCoverRef.current.value = ''; }}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 transition-colors"
                >
                  <X className="h-3.5 w-3.5" />
                  Remove cover
                </button>
              )}
              <input ref={editCoverRef} type="file" accept="image/*" onChange={handleEditCoverChange} className="hidden" />
            </div>
          </div>

          <input
            type="text"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder="Manga Title *"
            required
            className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-gray-300 dark:border-white/15 text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <textarea
            value={editDescription}
            onChange={(e) => setEditDescription(e.target.value)}
            placeholder="Description (optional)"
            rows={3}
            className="w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-gray-300 dark:border-white/15 text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors resize-none"
          />

          {/* Genre picker */}
          <div>
            <div className="flex flex-wrap gap-1.5 w-full px-3 py-2 rounded-xl border transition-colors min-h-[42px] bg-slate-100 dark:bg-white/5 border-gray-300 dark:border-white/15 focus-within:border-indigo-500">
              {editGenres.map((genre) => (
                <span
                  key={genre}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30"
                >
                  {genre}
                  <button type="button" onClick={() => removeEditGenre(genre)} className="hover:opacity-75 transition-opacity">
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
              <input
                type="text"
                value={editGenreInput}
                onChange={(e) => setEditGenreInput(e.target.value)}
                onKeyDown={handleEditGenreKeyDown}
                onBlur={() => addEditGenre(editGenreInput)}
                placeholder={editGenres.length === 0 ? 'Genres — type & press Enter' : ''}
                className="flex-1 min-w-[140px] bg-transparent text-sm text-slate-900 dark:text-gray-100 placeholder:text-slate-400 dark:placeholder:text-gray-500 outline-none"
              />
            </div>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Press Enter or comma to add. Backspace removes the last one.</p>
          </div>

          <button
            type="submit"
            disabled={editMutation.isPending || !editTitle.trim()}
            className="w-full py-2.5 rounded-xl mekai-primary-bg hover:opacity-90 disabled:opacity-60 text-white font-medium text-sm transition-opacity"
          >
            {editMutation.isPending ? 'Saving…' : 'Save Changes'}
          </button>
        </form>
      </Modal>

      {/* Delete Confirm Dialog */}
      <Modal
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete Manga"
      >
        <div className="flex flex-col gap-5">
          <p className="text-sm text-slate-600 dark:text-gray-400">
            Are you sure you want to delete{' '}
            <span className="font-semibold text-slate-900 dark:text-white">{manga?.title}</span>?
            This will permanently remove the manga and its cover image. Chapters are not deleted.
          </p>
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 text-slate-700 dark:text-gray-300 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white transition-colors"
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
