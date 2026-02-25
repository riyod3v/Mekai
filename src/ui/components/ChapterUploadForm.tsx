import React, { useState } from 'react';
import { FileArchive, Upload } from 'lucide-react';
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
  const [cbzFile, setCbzFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setCbzFile(file);
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cbzFile) { setError('Please select a .cbz file.'); return; }
    setError('');
    setLoading(true);
    try {
      await onSubmit({ chapterNumber, title: title.trim(), cbzFile });
      setTitle('');
      setCbzFile(null);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Upload failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Chapter number + title */}
      <div className="flex gap-3">
        <div className="flex-1">
          <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Chapter Number *</label>
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
          <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">Chapter Title (optional)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. The Beginning"
            className={inputCls}
          />
        </div>
      </div>

      {/* CBZ file picker */}
      <div>
        <label className="text-xs text-gray-600 dark:text-gray-400 mb-1 block">.cbz File *</label>
        <label
          className={clsx(
            'flex flex-col items-center justify-center w-full py-8 rounded-xl border-2 border-dashed cursor-pointer transition-colors',
            cbzFile
              ? 'border-indigo-500/50 bg-indigo-500/5'
              : 'border-gray-300 dark:border-white/20 hover:border-indigo-500/40'
          )}
        >
          <FileArchive className="h-8 w-8 text-gray-500 mb-2" />
          <span className="text-sm text-gray-600 dark:text-gray-400">
            {cbzFile ? cbzFile.name : 'Click to select a .cbz file'}
          </span>
          {cbzFile && (
            <span className="text-xs text-gray-500 mt-1">
              {(cbzFile.size / 1024 / 1024).toFixed(1)} MB
            </span>
          )}
          <input
            type="file"
            accept=".cbz,application/x-cbz,application/zip"
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>
      </div>

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl mekai-primary-bg hover:opacity-90 disabled:opacity-60 text-white font-medium text-sm transition-opacity"
      >
        <Upload className="h-4 w-4" />
        {loading ? 'Uploading…' : submitLabel}
      </button>
    </form>
  );
}

const inputCls =
  'w-full px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-white/5 border border-gray-300 dark:border-white/15 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors';
