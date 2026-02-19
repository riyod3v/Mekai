import { useState } from 'react';
import { Upload, ImageIcon } from 'lucide-react';
import type { MangaFormData, Visibility } from '@/types';
import clsx from 'clsx';

interface Props {
  onSubmit: (data: MangaFormData) => Promise<unknown>;
  defaultVisibility?: Visibility;
  allowVisibilityChange?: boolean;
  submitLabel?: string;
}

export function MangaUploadForm({
  onSubmit,
  defaultVisibility = 'shared',
  allowVisibilityChange = false,
  submitLabel = 'Create Manga',
}: Props) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [visibility, setVisibility] = useState<Visibility>(defaultVisibility);
  const [cover, setCover] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      await onSubmit({ title: title.trim(), description: description.trim(), visibility, cover });
      setTitle('');
      setDescription('');
      setCover(null);
      setCoverPreview(null);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Upload failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* Cover image */}
      <label className="flex flex-col items-center justify-center w-full aspect-[3/4] max-h-48 rounded-xl border-2 border-dashed border-white/20 hover:border-indigo-500/50 cursor-pointer transition-colors overflow-hidden relative">
        {coverPreview ? (
          <img src={coverPreview} alt="Cover preview" className="w-full h-full object-cover" />
        ) : (
          <div className="flex flex-col items-center gap-2 text-gray-500">
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

      {/* Visibility */}
      {allowVisibilityChange && (
        <div className="flex gap-2">
          {(['shared', 'private'] as Visibility[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setVisibility(v)}
              className={clsx(
                'flex-1 py-2 rounded-lg text-sm font-medium capitalize border transition-colors',
                visibility === v
                  ? 'bg-indigo-600 border-indigo-600 text-white'
                  : 'border-white/20 text-gray-400 hover:border-indigo-500/50'
              )}
            >
              {v}
            </button>
          ))}
        </div>
      )}

      {error && <p className="text-red-400 text-xs">{error}</p>}

      <button
        type="submit"
        disabled={loading}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-60 text-white font-medium text-sm transition-colors"
      >
        <Upload className="h-4 w-4" />
        {loading ? 'Creating…' : submitLabel}
      </button>
    </form>
  );
}

const inputCls =
  'w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-gray-100 placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors';
