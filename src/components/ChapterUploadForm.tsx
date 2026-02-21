import { useState } from 'react';
import { Image, Upload } from 'lucide-react';
import type { ChapterFormData } from '@/types';
import clsx from 'clsx';

interface Props {
  onSubmit: (data: ChapterFormData) => Promise<unknown>;
  existingChapterNumber?: number;
  submitLabel?: string;
}

export function ChapterUploadForm({ onSubmit, existingChapterNumber, submitLabel = 'Upload Chapter' }: Props) {
  const [chapterNumber, setChapterNumber] = useState(existingChapterNumber ?? 1);
  const [title, setTitle] = useState('');
  const [pages, setPages] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState('');

  function handleFilesChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    setPages(files);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (pages.length === 0) { setError('Please select page images.'); return; }
    setError('');
    setLoading(true);
    try {
      await onSubmit({
        chapterNumber,
        title: title.trim(),
        pages,
      });
      setTitle('');
      setPages([]);
      setProgress(null);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Upload failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Chapter number */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-gray-400 mb-1 block">Chapter Number *</label>
          <input
            type="number"
            min={1}
            value={chapterNumber}
            onChange={(e) => setChapterNumber(Number(e.target.value))}
            className={inputCls}
            required
            disabled={!!existingChapterNumber}
          />
        </div>
        <div className="flex-[2]">
          <label className="text-xs text-gray-400 mb-1 block">Chapter Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Beginning"
            className={inputCls}
          />
        </div>
      </div>

      {/* Pages upload */}
      <div>
        <label className="text-xs text-gray-400 mb-1 block">
          Page Images * ({pages.length} selected)
        </label>
        <label
          className={clsx(
            'flex flex-col items-center justify-center w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
            pages.length > 0
              ? 'border-indigo-500/50 bg-indigo-500/5'
              : 'border-white/20 hover:border-indigo-500/40'
          )}
        >
          <Image className="h-8 w-8 text-gray-500 mb-2" />
          <span className="text-sm text-gray-400">
            {pages.length > 0
              ? `${pages.length} page${pages.length > 1 ? 's' : ''} selected`
              : 'Click to select page images'}
          </span>
          <span className="text-xs text-gray-600 mt-1">
            Files will be sorted by name
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={handleFilesChange}
            className="sr-only"
          />
        </label>

        {/* File list preview */}
        {pages.length > 0 && (
          <ul className="mt-2 max-h-32 overflow-y-auto flex flex-col gap-1">
            {[...pages]
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
              .map((f, i) => (
                <li key={i} className="text-xs text-gray-400 flex items-center gap-1">
                  <Image className="h-3 w-3 text-gray-600 shrink-0" />
                  {f.name}
                </li>
              ))}
          </ul>
        )}
      </div>

      {/* Progress */}
      {progress && (
        <div>
          <div className="flex justify-between text-xs text-gray-400 mb-1">
            <span>Uploading…</span>
            <span>{progress.done}/{progress.total}</span>
          </div>
          <div className="h-1.5 rounded-full bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${(progress.done / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl mekai-primary-bg hover:opacity-90 disabled:opacity-60 text-white font-medium text-sm transition-opacity"
      >
        <Upload className="h-4 w-4" />
        {loading ? `Uploading (${progress?.done ?? 0}/${progress?.total ?? pages.length})…` : submitLabel}
      </button>
    </form>
  );
}

const inputCls =
  'w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-gray-100 placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors';
