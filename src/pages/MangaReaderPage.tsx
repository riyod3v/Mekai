import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft, ChevronLeft, ChevronRight, BookOpen, Loader2,
  Scan, History, X, List, Square,
} from 'lucide-react';
import JSZip from 'jszip';
import toast from 'react-hot-toast';
import clsx from 'clsx';

import { fetchChapterById, fetchChaptersByManga } from '@/services/chapters';
import { fetchChapterTranslations, upsertChapterTranslation } from '@/services/chapterTranslations';
import { addToWordVault } from '@/services/wordVault';
import { fetchReadingProgress, upsertReadingProgress } from '@/services/readingProgress';
import { LoadingSpinner } from '@/ui/components/LoadingSpinner';
import { ErrorState } from '@/ui/components/ErrorState';
import { OCRSelectionLayer, type SelectionRect } from '@/ui/components/OCRSelectionLayer';
import { TranslationOverlay } from '@/ui/components/TranslationOverlay';
import { HistoryPanel } from '@/ui/components/HistoryPanel';
import { Drawer } from '@/ui/components/Drawer';
import { ocrFromImageElement } from '@/lib/ocr';
import { toRomaji } from '@/lib/romaji';
import { translateJapaneseToEnglish } from '@/lib/translate';
import { useAuth } from '@/hooks/useAuth';
import { useRole } from '@/hooks/useRole';
import {
  useTranslationHistory,
  useAddTranslationHistory,
  useDeleteTranslationHistory,
} from '@/hooks/useTranslationHistory';
import type {
  RegionBox, TranslationHistoryRow, ChapterTranslationRow,
  ReadingMode,
} from '@/types';
import { regionHash } from '@/types';

// ─── Types ────────────────────────────────────────────────────

/** Lightweight OCR-in-progress state (one at a time). */
interface OcrState {
  pageIndex: number;
  selection: SelectionRect;
  /** 'running' covers OCR + translate + save; 'error' shows inline message */
  phase: 'running' | 'error';
  error: string | null;
}

/** In-memory overlay entry (derived from history rows, published rows, or newly created). */
interface Overlay {
  id: string;
  /** Dedup key: `${pageIndex}-${regionHash}` */
  key: string;
  pageIndex: number;
  region: RegionBox;
  ocrText: string;
  translated: string;
  romaji: string | null;
  /** 'published' overlays are read-only for non-translator users */
  source: 'history' | 'published';
}

// ─── Helpers ─────────────────────────────────────────────────

const IMAGE_EXTS = /\.(jpe?g|png|gif|webp|avif)$/i;

function naturalSort(a: string, b: string) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

function historyRowToOverlay(row: TranslationHistoryRow): Overlay {
  const region: RegionBox = row.region;
  return {
    id: row.id,
    key: `${row.page_index}-${regionHash(region)}`,
    pageIndex: row.page_index,
    region,
    ocrText: row.ocr_text,
    translated: row.translated,
    romaji: row.romaji,
    source: 'history',
  };
}

function publishedRowToOverlay(row: ChapterTranslationRow): Overlay {
  return {
    id: row.id,
    key: `${row.page_index}-${row.region_hash}`,
    pageIndex: row.page_index,
    region: row.region,
    ocrText: row.ocr_text,
    translated: row.translated,
    romaji: row.romaji,
    source: 'published',
  };
}

// ─── Per-page sub-component ───────────────────────────────────

interface PageItemProps {
  src: string;
  pageIndex: number;
  loading: 'eager' | 'lazy';
  selectionActive: boolean;
  onSelect: (pageIndex: number, sel: SelectionRect, imgEl: HTMLImageElement) => void;
  ocrState: OcrState | null;
  onDismissOcr: () => void;
  overlays: Overlay[];
  highlightId: string | null;
  onDismissOverlay: (id: string) => void;
  onSaveToVault: (id: string) => void;
  isTranslatorOwner: boolean;
}

function ReaderPageItem({
  src, pageIndex, loading, selectionActive,
  onSelect, ocrState, onDismissOcr, overlays, highlightId,
  onDismissOverlay, onSaveToVault, isTranslatorOwner,
}: PageItemProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  const handleSelect = useCallback(
    (sel: SelectionRect) => {
      if (imgRef.current) onSelect(pageIndex, sel, imgRef.current);
    },
    [pageIndex, onSelect],
  );

  return (
    <div data-page-index={pageIndex} className="w-full relative">
      <OCRSelectionLayer
        active={selectionActive}
        imageRef={imgRef}
        onSelect={handleSelect}
      >
        <img
          ref={imgRef}
          src={src}
          alt={`Page ${pageIndex + 1}`}
          className="w-full block"
          loading={loading}
          draggable={false}
          crossOrigin="anonymous"
        />

        {/* In-bubble translation overlays */}
        {overlays.map((ov) => (
          <TranslationOverlay
            key={ov.key}
            id={ov.id}
            region={ov.region}
            translated={ov.translated}
            romaji={ov.romaji}
            ocrText={ov.ocrText}
            highlighted={highlightId === ov.id}
            readOnly={ov.source === 'published' && !isTranslatorOwner}
            onDismiss={onDismissOverlay}
            onSaveToVault={onSaveToVault}
          />
        ))}

        {/* Running spinner — centred over selected region */}
        {ocrState?.phase === 'running' && (
          <div
            className="absolute flex items-center justify-center z-20 pointer-events-none"
            style={{
              left: `${ocrState.selection.region.x * 100}%`,
              top: `${ocrState.selection.region.y * 100}%`,
              width: `${ocrState.selection.region.w * 100}%`,
              height: `${ocrState.selection.region.h * 100}%`,
            }}
          >
            <div className="flex items-center gap-2 glass rounded-xl px-3 py-1.5 text-xs text-indigo-300">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Translating…
            </div>
          </div>
        )}

        {/* Inline error */}
        {ocrState?.phase === 'error' && (
          <div
            className="absolute z-20"
            style={{
              left: `${ocrState.selection.region.x * 100}%`,
              top: `calc(${(ocrState.selection.region.y + ocrState.selection.region.h) * 100}% + 6px)`,
            }}
          >
            <div className="glass rounded-xl border border-red-500/30 px-3 py-2 text-xs text-red-400 flex items-center gap-2">
              <span>{ocrState.error ?? 'OCR failed, try selecting a clearer region.'}</span>
              <button onClick={onDismissOcr} className="hover:text-red-300 transition-colors">
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        )}
      </OCRSelectionLayer>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────

export default function MangaReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isTranslator } = useRole();

  // ── CBZ state ──────────────────────────────────────────────
  const [images, setImages] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const prevUrls = useRef<string[]>([]);

  // ── Reading mode (persisted) ──────────────────────────────
  const [readingMode, setReadingMode] = useState<ReadingMode>(() =>
    (localStorage.getItem('mekai-reading-mode') as ReadingMode) ?? 'scroll'
  );
  const [currentPage, setCurrentPage] = useState(0);
  const initialProgressApplied = useRef(false);

  function toggleReadingMode() {
    setReadingMode((prev) => {
      const next: ReadingMode = prev === 'scroll' ? 'page' : 'scroll';
      localStorage.setItem('mekai-reading-mode', next);
      return next;
    });
    setCurrentPage(0);
    setOcr(null);
  }

  // ── OCR + history state ────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ocr, setOcr] = useState<OcrState | null>(null);
  const [userOverlays, setUserOverlays] = useState<Overlay[]>([]);
  const [publishedOverlays, setPublishedOverlays] = useState<Overlay[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: historyRows } = useTranslationHistory(chapterId ?? '');
  const addHistory = useAddTranslationHistory();
  const deleteHistory = useDeleteTranslationHistory(chapterId ?? '');

  // ── Sync user overlays from persisted history ─────────────
  useEffect(() => {
    if (historyRows) setUserOverlays(historyRows.map(historyRowToOverlay));
  }, [historyRows]);

  // ── Chapter queries ────────────────────────────────────────
  const {
    data: chapter,
    isLoading: chapterLoading,
    error: chapterError,
  } = useQuery({
    queryKey: ['chapter', chapterId],
    enabled: !!chapterId,
    queryFn: () => fetchChapterById(chapterId!),
  });

  const { data: siblings = [] } = useQuery({
    queryKey: ['chapters', chapter?.manga_id],
    enabled: !!chapter?.manga_id,
    queryFn: () => fetchChaptersByManga(chapter!.manga_id),
  });

  const currentIdx = siblings.findIndex((c) => c.id === chapterId);
  const prevChapter = currentIdx > 0 ? siblings[currentIdx - 1] : null;
  const nextChapter =
    currentIdx >= 0 && currentIdx < siblings.length - 1 ? siblings[currentIdx + 1] : null;

  // Determine if current user is the translator who owns this chapter
  const isTranslatorOwner = !!(isTranslator && chapter && user && chapter.owner_id === user.id);

  // ── Fetch published translations ──────────────────────────
  const { data: publishedRows } = useQuery({
    queryKey: ['chapter_translations', chapterId],
    enabled: !!chapterId,
    queryFn: () => fetchChapterTranslations(chapterId!),
  });

  useEffect(() => {
    if (publishedRows) setPublishedOverlays(publishedRows.map(publishedRowToOverlay));
  }, [publishedRows]);

  // ── Merge overlays: published + user (dedup by key) ───────
  const mergedOverlays = useMemo(() => {
    const map = new Map<string, Overlay>();
    // Published first (lower priority)
    for (const ov of publishedOverlays) map.set(ov.key, ov);
    // User overlays override (higher priority — user's own translations)
    for (const ov of userOverlays) map.set(ov.key, ov);
    return Array.from(map.values());
  }, [publishedOverlays, userOverlays]);

  // ── Extract CBZ ────────────────────────────────────────────
  useEffect(() => {
    if (!chapter?.cbz_url) return;

    prevUrls.current.forEach((u) => URL.revokeObjectURL(u));
    prevUrls.current = [];
    setImages([]);
    setExtractError(null);
    setExtracting(true);
    setOcr(null);
    setUserOverlays([]);
    setPublishedOverlays([]);
    setCurrentPage(0);
    initialProgressApplied.current = false;

    (async () => {
      try {
        const response = await fetch(chapter.cbz_url);
        if (!response.ok) throw new Error(`Failed to fetch CBZ (${response.status})`);
        const blob = await response.blob();
        const zip = await JSZip.loadAsync(blob);

        const imageEntries = Object.values(zip.files)
          .filter((f) => !f.dir && IMAGE_EXTS.test(f.name))
          .sort((a, b) => naturalSort(a.name, b.name));

        if (imageEntries.length === 0) throw new Error('No images found in this CBZ file.');

        const urls = await Promise.all(
          imageEntries.map(async (entry) => {
            const arrayBuffer = await entry.async('arraybuffer');
            const ext = (entry.name.match(/\.(\w+)$/) ?? [])[1] ?? 'jpeg';
            const mime =
              ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
              : ext === 'png' ? 'image/png'
              : ext === 'gif' ? 'image/gif'
              : ext === 'webp' ? 'image/webp'
              : 'image/jpeg';
            const imgBlob = new Blob([arrayBuffer], { type: mime });
            return URL.createObjectURL(imgBlob);
          }),
        );

        prevUrls.current = urls;
        setImages(urls);
      } catch (err) {
        setExtractError((err as Error).message);
      } finally {
        setExtracting(false);
      }
    })();

    return () => {
      prevUrls.current.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [chapter?.cbz_url, chapter?.id]);

  // ── Reading progress: restore on chapter load ─────────────
  useEffect(() => {
    if (!chapterId || images.length === 0 || initialProgressApplied.current) return;
    initialProgressApplied.current = true;

    (async () => {
      try {
        const progress = await fetchReadingProgress(chapterId);
        if (progress && progress.last_page_index > 0) {
          const page = Math.min(progress.last_page_index, images.length - 1);
          if (readingMode === 'page') {
            setCurrentPage(page);
          } else {
            // Scroll mode: scroll to the saved page after a brief delay
            setTimeout(() => {
              document
                .querySelector(`[data-page-index="${page}"]`)
                ?.scrollIntoView({ behavior: 'auto', block: 'start' });
            }, 100);
          }
        }
      } catch {
        // Silently ignore — progress restore is best-effort
      }
    })();
  }, [chapterId, images.length, readingMode]);

  // ── Reading progress: save on page change (page mode) ─────
  const progressDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (readingMode !== 'page' || !chapterId || images.length === 0) return;
    if (progressDebounce.current) clearTimeout(progressDebounce.current);
    progressDebounce.current = setTimeout(() => {
      void upsertReadingProgress(chapterId, currentPage);
    }, 1000);
    return () => {
      if (progressDebounce.current) clearTimeout(progressDebounce.current);
    };
  }, [currentPage, readingMode, chapterId, images.length]);

  // ── Reading progress: IntersectionObserver for scroll mode ─
  useEffect(() => {
    if (readingMode !== 'scroll' || !chapterId || images.length === 0) return;

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const visiblePages = new Set<number>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (Number.isNaN(idx)) continue;
          if (entry.isIntersecting) visiblePages.add(idx);
          else visiblePages.delete(idx);
        }

        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          if (visiblePages.size > 0) {
            const midPage = Math.round(
              [...visiblePages].reduce((a, b) => a + b, 0) / visiblePages.size,
            );
            void upsertReadingProgress(chapterId, midPage);
          }
        }, 2000);
      },
      { threshold: 0.3 },
    );

    const pages = document.querySelectorAll('[data-page-index]');
    pages.forEach((el) => observer.observe(el));

    return () => {
      observer.disconnect();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [readingMode, chapterId, images.length]);

  // ── OCR selection handler (fully automatic pipeline) ──────
  const handlePageSelect = useCallback(
    async (pageIndex: number, sel: SelectionRect, imgEl: HTMLImageElement) => {
      if (!chapter) return;
      setOcr({ phase: 'running', pageIndex, selection: sel, error: null });
      try {
        const ocrText = await ocrFromImageElement(imgEl, sel.region);
        if (!ocrText.trim()) {
          setOcr((prev) =>
            prev ? { ...prev, phase: 'error', error: 'No text detected in this region.' } : null,
          );
          return;
        }
        const translated = await translateJapaneseToEnglish(ocrText);
        const romaji = toRomaji(ocrText);

        // Always save to private history
        const row = await addHistory.mutateAsync({
          chapterId: chapter.id,
          pageIndex,
          region: sel.region,
          ocrText,
          translated,
          romaji,
        });

        // Build overlay immediately
        const newOverlay = historyRowToOverlay(row);
        setUserOverlays((prev) => [newOverlay, ...prev]);
        setOcr(null);
        toast.success('Translation saved');

        // If translator + chapter owner → also publish
        if (isTranslatorOwner) {
          try {
            await upsertChapterTranslation({
              chapter_id: chapter.id,
              page_index: pageIndex,
              region: sel.region,
              region_hash: regionHash(sel.region),
              ocr_text: ocrText,
              translated,
              romaji,
            });
          } catch {
            // Non-critical — private history was already saved
            console.warn('Failed to publish chapter translation');
          }
        }
      } catch (err) {
        setOcr((prev) =>
          prev ? { ...prev, phase: 'error', error: (err as Error).message } : null,
        );
      }
    },
    [chapter, addHistory, isTranslatorOwner],
  );

  // ── Dismiss overlay + delete from DB ──────────────────────
  const handleDismissOverlay = useCallback(
    async (id: string) => {
      setUserOverlays((prev) => prev.filter((o) => o.id !== id));
      try {
        await deleteHistory.mutateAsync(id);
      } catch {
        toast.error('Failed to delete from history');
      }
    },
    [deleteHistory],
  );

  // ── Save overlay to word vault ─────────────────────────────
  const handleSaveToVault = useCallback(
    async (overlayId: string) => {
      const ov = mergedOverlays.find((o) => o.id === overlayId);
      if (!ov) return;
      try {
        await addToWordVault({
          chapter_id: chapterId ?? undefined,
          page_index: ov.pageIndex,
          region: ov.region,
          original: ov.ocrText,
          translated: ov.translated,
          romaji: ov.romaji,
        });
        toast.success('Saved to Word Vault');
      } catch {
        toast.error('Failed to save to Word Vault');
      }
    },
    [mergedOverlays, chapterId],
  );

  // ── Keyboard navigation (page mode only) ─────────────────
  useEffect(() => {
    if (readingMode !== 'page' || images.length === 0) return;
    function onKey(e: KeyboardEvent) {
      // Don't hijack when typing in an input / textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setCurrentPage((p) => Math.min(p + 1, images.length - 1));
        setOcr(null);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setCurrentPage((p) => Math.max(p - 1, 0));
        setOcr(null);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [readingMode, images.length]);

  // ── History highlight ──────────────────────────────────────
  const handleHighlight = useCallback((entry: TranslationHistoryRow) => {
    if (readingMode === 'page') {
      // Switch to the right page, then highlight after render tick
      setCurrentPage(entry.page_index);
      setOcr(null);
      setTimeout(() => {
        setHighlightId(entry.id);
        if (highlightTimer.current) clearTimeout(highlightTimer.current);
        highlightTimer.current = setTimeout(() => setHighlightId(null), 3000);
      }, 80);
    } else {
      document
        .querySelector(`[data-page-index="${entry.page_index}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(entry.id);
      if (highlightTimer.current) clearTimeout(highlightTimer.current);
      highlightTimer.current = setTimeout(() => setHighlightId(null), 3000);
    }
  }, [readingMode]);

  // ── Toggle selection mode ──────────────────────────────────
  function toggleSelectionMode() {
    setSelectionMode((v) => {
      if (v) setOcr(null);
      return !v;
    });
  }

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
      {/* ── Top bar (CSS grid: left / center / right) ────────── */}
      <header className="sticky top-0 z-50 grid grid-cols-[auto_1fr_auto] items-center gap-2 px-4 py-3 bg-gray-950/90 backdrop-blur border-b border-white/10">
        {/* Left: Back + prev/next chapter */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => navigate(`/manga/${chapter.manga_id}`)}
            className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-indigo-300 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">Back</span>
          </button>

          <div className="w-px h-5 bg-white/10 mx-1 hidden sm:block" />

          {prevChapter ? (
            <Link
              to={`/read/${prevChapter.id}`}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Ch.{prevChapter.chapter_number}</span>
            </Link>
          ) : (
            <span className="px-2 py-1.5 text-xs text-gray-600">
              <ChevronLeft className="h-3.5 w-3.5 inline" />
            </span>
          )}
          {nextChapter ? (
            <Link
              to={`/read/${nextChapter.id}`}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <span className="hidden sm:inline">Ch.{nextChapter.chapter_number}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <span className="px-2 py-1.5 text-xs text-gray-600">
              <ChevronRight className="h-3.5 w-3.5 inline" />
            </span>
          )}
        </div>

        {/* Center: chapter title (always centered) */}
        <div className="min-w-0 text-center">
          <p className="text-sm font-semibold text-white truncate">
            Chapter {chapter.chapter_number}
            {chapter.title ? ` — ${chapter.title}` : ''}
          </p>
        </div>

        {/* Right: tool buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {/* OCR mode toggle */}
          <button
            onClick={toggleSelectionMode}
            title={selectionMode ? 'Exit OCR mode' : 'Enable OCR selection'}
            className={clsx(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
              selectionMode
                ? 'bg-indigo-600 text-white hover:bg-indigo-500'
                : 'text-gray-400 hover:text-white hover:bg-white/10',
            )}
          >
            <Scan className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{selectionMode ? 'OCR On' : 'OCR'}</span>
          </button>

          {/* History toggle */}
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            title="Translation history"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <History className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">History</span>
          </button>

          {/* Reading mode toggle */}
          <button
            onClick={toggleReadingMode}
            title={readingMode === 'scroll' ? 'Switch to page mode' : 'Switch to scroll mode'}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            {readingMode === 'scroll'
              ? <Square className="h-3.5 w-3.5" />
              : <List className="h-3.5 w-3.5" />}
            <span className="hidden sm:inline">
              {readingMode === 'scroll' ? 'Page' : 'Scroll'}
            </span>
          </button>
        </div>
      </header>

      {/* ── Reading area ─────────────────────────────────────── */}
      <main className="flex-1 flex flex-col items-center">
        {selectionMode && (
          <div className="w-full max-w-3xl mx-auto px-4 pt-3">
            <div className="glass rounded-xl border border-indigo-500/30 px-4 py-2 text-xs text-indigo-300 text-center">
              Drag to select a text region on any page — OCR will run automatically.
            </div>
          </div>
        )}

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
          readingMode === 'scroll' ? (
            /* ── Scroll mode: all pages stacked vertically ── */
            <div className="w-full max-w-3xl mx-auto flex flex-col items-center">
              {images.map((src, i) => (
                <ReaderPageItem
                  key={src}
                  src={src}
                  pageIndex={i}
                  loading={i < 3 ? 'eager' : 'lazy'}
                  selectionActive={selectionMode}
                  onSelect={handlePageSelect}
                  ocrState={ocr?.pageIndex === i ? ocr : null}
                  onDismissOcr={() => setOcr(null)}
                  overlays={mergedOverlays.filter((o) => o.pageIndex === i)}
                  highlightId={highlightId}
                  onDismissOverlay={handleDismissOverlay}
                  onSaveToVault={handleSaveToVault}
                  isTranslatorOwner={isTranslatorOwner}
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
          ) : (
            /* ── Page mode: one page at a time ── */
            <div className="w-full max-w-3xl mx-auto flex flex-col items-center gap-4 py-4">
              {/* Single page */}
              <ReaderPageItem
                key={images[currentPage]}
                src={images[currentPage]}
                pageIndex={currentPage}
                loading="eager"
                selectionActive={selectionMode}
                onSelect={handlePageSelect}
                ocrState={ocr?.pageIndex === currentPage ? ocr : null}
                onDismissOcr={() => setOcr(null)}
                overlays={mergedOverlays.filter((o) => o.pageIndex === currentPage)}
                highlightId={highlightId}
                onDismissOverlay={handleDismissOverlay}
                onSaveToVault={handleSaveToVault}
                isTranslatorOwner={isTranslatorOwner}
              />

              {/* Page navigation bar */}
              <div className="flex items-center gap-3 py-2">
                <button
                  onClick={() => { setCurrentPage((p) => Math.max(p - 1, 0)); setOcr(null); }}
                  disabled={currentPage === 0}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Prev
                </button>

                <span className="text-sm text-gray-400 tabular-nums min-w-[5rem] text-center">
                  {currentPage + 1} / {images.length}
                </span>

                <button
                  onClick={() => { setCurrentPage((p) => Math.min(p + 1, images.length - 1)); setOcr(null); }}
                  disabled={currentPage === images.length - 1}
                  className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium bg-white/10 hover:bg-white/15 text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>

              {/* End-of-chapter footer — only shown on last page */}
              {currentPage === images.length - 1 && (
                <div className="w-full py-8 flex flex-col items-center gap-4 border-t border-white/10">
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
              )}
            </div>
          )
        )}
      </main>

      {/* ── History drawer ───────────────────────────────────── */}
      <Drawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        title="Translation History"
        side="right"
      >
        {chapterId && (
          <HistoryPanel
            chapterId={chapterId}
            onHighlight={(entry) => {
              setHistoryOpen(false);
              handleHighlight(entry);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}
