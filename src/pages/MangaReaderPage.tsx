import { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ChevronLeft, ChevronRight, BookOpen, Loader2 } from 'lucide-react';
import JSZip from 'jszip';

import { fetchChapterById, fetchChaptersByManga } from '@/services/chapters';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorState } from '@/components/ErrorState';

// Image file extensions inside a CBZ
const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|avif)$/i;

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

export default function MangaReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();

  const [images, setImages] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const prevUrls = useRef<string[]>([]);

  // Fetch current chapter
  const {
    data: chapter,
    isLoading: chapterLoading,
    error: chapterError,
  } = useQuery({
    queryKey: ['chapter', chapterId],
    enabled: !!chapterId,
    queryFn: () => fetchChapterById(chapterId!),
  });

  // Fetch sibling chapters for prev/next navigation
  const { data: siblings = [] } = useQuery({
    queryKey: ['chapters', chapter?.manga_id],
    enabled: !!chapter?.manga_id,
    queryFn: () => fetchChaptersByManga(chapter!.manga_id),
  });

  const currentIdx = siblings.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextChapter = currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;

  // Extract images from CBZ whenever chapter changes
  useEffect(() => {
    if (!chapter?.cbz_url) return;

    // Revoke old object URLs to avoid memory leaks
    prevUrls.current.forEach((u) => URL.revokeObjectURL(u));
    prevUrls.current = [];
    setImages([]);
    setExtractError(null);
    setExtracting(true);

    (async () => {
      try {
        const response = await fetch(chapter.cbz_url);
        if (!response.ok) throw new Error(`Failed to fetch CBZ (${response.status})`);
        const blob = await response.blob();
        const zip = await JSZip.loadAsync(blob);

        // Collect image entries sorted by filename
        const imageEntries = Object.values(zip.files)
          .filter((f) => !f.dir && IMAGE_EXTS.test(f.name))
          .sort((a, b) => naturalSort(a.name, b.name));

        if (imageEntries.length === 0) throw new Error('No images found in this CBZ file.');

        // Generate object URLs for all images in parallel
        const urls = await Promise.all(
          imageEntries.map(async (entry) => {
            const arrayBuffer = await entry.async('arraybuffer');
            const ext = (entry.name.match(/\.(\w+)$/) ?? [])[1] ?? 'jpeg';
            const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
              : ext === 'png' ? 'image/png'
              : ext === 'gif' ? 'image/gif'
              : ext === 'webp' ? 'image/webp'
              : 'image/jpeg';
            const imgBlob = new Blob([arrayBuffer], { type: mime });
            return URL.createObjectURL(imgBlob);
          })
        );

        prevUrls.current = urls;
        setImages(urls);
      } catch (err) {
        setExtractError((err as Error).message);
      } finally {
        setExtracting(false);
      }
    })();

    // Cleanup on unmount or chapter change
    return () => {
      prevUrls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [chapter?.cbz_url, chapter?.id]);

  // ── Render ─────────────────────────────────────────────────

  if (chapterLoading) {
    return (
      <div className="flex justify-center py-24">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (chapterError || !chapter) {
    return (
      <div className="max-w-2xl mx-auto py-16 px-4">
        <ErrorState
          title="Chapter not found"
          message={(chapterError as Error)?.message ?? 'Could not load this chapter.'}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-50 flex items-center gap-3 px-4 py-3 bg-gray-950/90 backdrop-blur border-b border-white/10">
        <button
          onClick={() => navigate(`/manga/${chapter.manga_id}`)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-indigo-300 transition-colors shrink-0"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        <div className="flex-1 min-w-0 text-center">
          <p className="text-sm font-semibold text-white truncate">
            Chapter {chapter.chapter_number}
            {chapter.title ? ` — ${chapter.title}` : ''}
          </p>
        </div>

        {/* Prev / Next */}
        <div className="flex items-center gap-1 shrink-0">
          {prevChapter ? (
            <Link
              to={`/read/${prevChapter.id}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Ch.{prevChapter.chapter_number}
            </Link>
          ) : (
            <span className="px-3 py-1.5 text-xs text-gray-600">
              <ChevronLeft className="h-3.5 w-3.5 inline" />
            </span>
          )}
          {nextChapter ? (
            <Link
              to={`/read/${nextChapter.id}`}
              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              Ch.{nextChapter.chapter_number}
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="px-3 py-1.5 text-xs text-gray-600">
              <ChevronRight className="h-3.5 w-3.5 inline" />
            </span>
          )}
        </div>
      </header>

      {/* Reading area */}
      <main className="flex-1 flex flex-col items-center">
        {extracting && (
          <div className="flex flex-col items-center gap-3 py-24 text-gray-400">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-400" />
            <p className="text-sm">Loading chapter…</p>
          </div>
        )}

        {extractError && (
          <div className="max-w-md mx-auto py-16 px-4 text-center">
            <p className="text-red-400 text-sm">{extractError}</p>
          </div>
        )}

        {!extracting && !extractError && images.length > 0 && (
          <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
            {images.map((src, i) => (
              <img
                key={i}
                src={src}
                alt={`Page ${i + 1}`}
                className="w-full block"
                loading={i < 3 ? 'eager' : 'lazy'}
                draggable={false}
              />
            ))}

            {/* End-of-chapter footer */}
            <div className="w-full py-10 flex flex-col items-center gap-4 border-t border-white/10 mt-2">
              <BookOpen className="h-6 w-6 text-indigo-400" />
              <p className="text-sm text-gray-400">End of Chapter {chapter.chapter_number}</p>
              <div className="flex gap-3">
                {nextChapter ? (
                  <Link
                    to={`/read/${nextChapter.id}`}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl mekai-primary-bg hover:opacity-90 text-white text-sm font-medium transition-opacity"
                  >
                    Next: Chapter {nextChapter.chapter_number}
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                ) : (
                  <Link
                    to={`/manga/${chapter.manga_id}`}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 text-sm font-medium transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Back to Manga
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
