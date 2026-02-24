import { useState } from 'react';
import { Upload, ImageIcon, X } from 'lucide-react';
import { useRole } from '@/hooks/useRole';
import type { MangaFormData } from '@/types';
import clsx from 'clsx';

interface Props {
  onSubmit: (data: MangaFormData) => Promise<unknown>;
  submitLabel?: string;
  initialGenres?: string[];
}

export function MangaUploadForm({
  onSubmit,
  submitLabel = 'Create Manga',
  initialGenres = [],
}: Props) {
  const { isTranslator } = useRole();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Auto-set based on role: translators share publicly, readers keep private
  const visibility = isTranslator ? 'shared' : 'private';
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(initialGenres);
  const [genreInput, setGenreInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function addGenre(raw: string) {
    const tag = raw.trim();
    if (tag && !selectedGenres.includes(tag)) {
      setSelectedGenres((prev) => [...prev, tag]);
    }
    setGenreInput('');
  }

  function removeGenre(genre: string) {
    setSelectedGenres((prev) => prev.filter((g) => g !== genre));
  }

  function handleGenreKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addGenre(genreInput);
    } else if (e.key === 'Backspace' && genreInput === '' && selectedGenres.length > 0) {
      setSelectedGenres((prev) => prev.slice(0, -1));
    }
  }

  function handleCoverChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCover(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setCoverPreview(url);
    } else {
      setCoverPreview(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) { setError('Title is required.'); return; }
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        visibility,
        cover,
        genres: selectedGenres,
      });
      setTitle('');
      setDescription('');
      setCover(null);
      setCoverPreview(null);
      setSelectedGenres([]);
      setGenreInput('');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Upload failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Cover image */}
      <label className="flex flex-col items-center justify-center w-full aspect-[3/4] max-h-48 rounded-xl border-2 border-dashed border-gray-300 dark:border-white/20 hover:border-indigo-500/50 cursor-pointer transition-colors overflow-hidden relative bg-gray-50 dark:bg-transparent">
        {coverPreview ? (
          <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-400 dark:text-gray-500">
            <ImageIcon className="h-8 w-8" />
            <span className="text-xs">Upload Cover (optional)</span>
          </div>
        )}
        <input type="file" accept="image/*" onChange={handleCoverChange} className="sr-only" />
      </label>

      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Manga Title *"
        className={inputCls}
        required
      />

      {/* Description */}
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={3}
        className={clsx(inputCls, 'resize-none')}
      />

      {/* Genre Tags */}
      <div>
        <div className={clsx(
          'flex flex-wrap gap-1.5 w-full px-3 py-2 rounded-xl border transition-colors min-h-[42px]',
          'bg-slate-100 dark:bg-white/5 border-gray-300 dark:border-white/15 focus-within:border-indigo-500'
        )}>
          {selectedGenres.map((genre) => (
            <span
              key={genre}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30"
            >
              {genre}
              <button type="button" onClick={() => removeGenre(genre)} className="hover:opacity-75 transition-opacity">
                <X className="h-3 w-3" />
              </button>
            </span>
          ))}
          <input
            type="text"
            value={genreInput}
            onChange={(e) => setGenreInput(e.target.value)}
            onKeyDown={handleGenreKeyDown}
            onBlur={() => addGenre(genreInput)}
            placeholder={selectedGenres.length === 0 ? 'Genres (optional) — type & press Enter' : ''}
            className="flex-1 min-w-[140px] bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 outline-none"
          />
        </div>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Press Enter or comma to add a genre. Backspace removes the last one.</p>
      </div>

      {error && <p className="text-red-500 dark:text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl mekai-primary-bg hover:opacity-90 disabled:opacity-60 text-white font-medium text-sm transition-opacity"
      >
        <Upload className="h-4 w-4" />
        {loading ? 'Creating…' : submitLabel}
      </button>
    </form>
  );
}

const inputCls =
  'w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-gray-300 dark:border-white/15 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors';
