import { useState } from 'react';
import { Upload, ImageIcon } from 'lucide-react';
import { useRole } from '@/hooks/useRole';
import type { MangaFormData } from '@/types';
import clsx from 'clsx';

interface Props {
  onSubmit: (data: MangaFormData) => Promise<unknown>;
  submitLabel?: string;
}

export function MangaUploadForm({
  onSubmit,
  submitLabel = 'Create Manga',
}: Props) {
  const { isTranslator } = useRole();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  // Auto-set based on role: translators share publicly, readers keep private
  const visibility = isTranslator ? 'shared' : 'private';
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


      {error && <p className="text-red-400 text-xs">{error}</p>}

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
  'w-full px-4 py-2.5 rounded-xl bg-white/5 border border-white/15 text-gray-100 placeholder:text-gray-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors';
