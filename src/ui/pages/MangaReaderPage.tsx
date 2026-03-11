import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
import type { Swiper as SwiperType } from 'swiper';
import 'swiper/css';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { logger } from '@/lib/utils/logger';
import {
  ArrowLeft, ChevronLeft, ChevronRight, BookOpen, Loader2,
  Scan, History, X, List, Square, Menu,
} from 'lucide-react';
import JSZip from 'jszip';
import { useNotification } from '@/context/NotificationContext';

import { fetchChapterById, fetchChaptersByManga } from '@/services/chapters';
import { fetchMangaById } from '@/services/manga';
import { fetchChapterTranslations, upsertChapterTranslation, deleteChapterTranslation } from '@/services/chapterTranslations';
import { addToWordVault } from '@/services/wordVault';
import { fetchReadingProgress, upsertReadingProgress } from '@/services/readingProgress';
import { LoadingSpinner } from '@/ui/components/LoadingSpinner';
import { ErrorState } from '@/ui/components/ErrorState';
import { OCRSelectionLayer, type SelectionRect } from '@/ui/components/OCRSelectionLayer';
import { TranslationOverlay } from '@/ui/components/TranslationOverlay';
import { HistoryPanel } from '@/ui/components/HistoryPanel';
import { Drawer } from '@/ui/components/Drawer';
import { ocrAndTranslate } from '@/lib/utils/browserAPI';
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
  /** Which OCR engine produced ocrText (undefined for rows loaded from DB) */
  ocrSource?: 'manga-ocr';
  /** Which translation provider produced translated (undefined for DB rows) */
  translationProvider?: 'py-mekai-api';
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

/**
 * Return true when two fractional RegionBoxes overlap by more than
 * `threshold` (0–1) of the smaller region's area.  Used to prevent
 * OCR from firing on a bubble that already has a published translation.
 */
function regionsOverlap(a: RegionBox, b: RegionBox, threshold = 0.3): boolean {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return false;
  const intersection = (x2 - x1) * (y2 - y1);
  const smaller = Math.min(a.w * a.h, b.w * b.h);
  return smaller > 0 && intersection / smaller >= threshold;
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
  onSaveToVault?: (id: string) => void;
  isChapterOwner: boolean;
  readOnly?: boolean;
  onImageRef?: (pageIndex: number, ref: HTMLImageElement | null) => void;
}

function ReaderPageItem({
  src, pageIndex, loading, selectionActive,
  onSelect, ocrState, onDismissOcr, overlays, highlightId,
  onDismissOverlay, onSaveToVault, isChapterOwner, readOnly, onImageRef,
}: PageItemProps) {
  const imgRef = useRef<HTMLImageElement>(null);

  // Update ref map when image ref changes
  useEffect(() => {
    if (onImageRef) {
      onImageRef(pageIndex, imgRef.current);
    }
  }, [pageIndex, onImageRef]);

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
            ocrSource={ov.ocrSource}
            translationProvider={ov.translationProvider}
            highlighted={highlightId === ov.id}
            readOnly={readOnly}
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
            <div className="bg-white dark:bg-white/5 backdrop-blur-md rounded-xl border border-red-300 dark:border-red-500/30 px-3 py-2 text-xs text-red-500 dark:text-red-400 flex items-center gap-2">
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
  const queryClient = useQueryClient();
  const { chapterId } = useParams<{ chapterId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isTranslator, isReader } = useRole();

  // ── CBZ state ──────────────────────────────────────────────
  const [images, setImages] = useState<string[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const prevUrls = useRef<string[]>([]);

  // ── Reading mode ──────────────────────────────
  const [readingMode, setReadingMode] = useState<ReadingMode>(() =>
    (localStorage.getItem('mekai-reading-mode') as ReadingMode) ?? 'scroll'
  );
  const [currentPage, setCurrentPage] = useState(0);
  const initialProgressApplied = useRef(false);
  const imageRefs = useRef<{ [key: number]: HTMLImageElement | null }>({});

  function toggleReadingMode() {
    setReadingMode((prev) => {
      const next: ReadingMode = prev === 'scroll' ? 'page' : 'scroll';
      localStorage.setItem('mekai-reading-mode', next);
      return next;
    });
    setCurrentPage(0);
    setOcr(null);
    setUiVisible(true);
    swiperRef.current = null;
    setSwiperInstance(null);
  }

  // ── Swiper + UI-overlay state ───────────────────────────────
  const [swiperInstance, setSwiperInstance] = useState<SwiperType | null>(null);
  const swiperRef = useRef<SwiperType | null>(null);
  const [uiVisible, setUiVisible] = useState(true);

  // Sync currentPage → Swiper for external navigation (progress restore, history highlight)
  useEffect(() => {
    if (swiperRef.current && swiperRef.current.realIndex !== currentPage) {
      swiperRef.current.slideTo(currentPage);
    }
  }, [currentPage, swiperInstance]);

  // ── OCR + history state ────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [ocr, setOcr] = useState<OcrState | null>(null);
  const [userOverlays, setUserOverlays] = useState<Overlay[]>([]);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: historyRows } = useTranslationHistory(chapterId ?? '');
  const addHistory = useAddTranslationHistory();
  const deleteHistory = useDeleteTranslationHistory(chapterId ?? '');
  const notify = useNotification();

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

  // ── Fetch manga to determine visibility ──────────────────
  const { data: manga } = useQuery({
    queryKey: ['manga', chapter?.manga_id],
    enabled: !!chapter?.manga_id,
    queryFn: () => fetchMangaById(chapter!.manga_id),
  });

  // Readers viewing shared (published) manga → read-only, no OCR tools
  const isSharedManga = manga?.visibility === 'shared';
  const isReadOnlyViewer = !!(isReader && isSharedManga);

  // Any translator can publish translations for readers to see
  const canPublishTranslations = !!(isTranslator && chapter && user);
  
  // Only the chapter owner can edit published translations (other translators see them as read-only)
  const isChapterOwner = !!(user && chapter && chapter.owner_id === user.id);

  // ── Fetch published translations ──────────────────────────
  const { data: publishedRows } = useQuery({
    queryKey: ['chapter_translations', chapterId],
    enabled: !!chapterId,
    queryFn: () => fetchChapterTranslations(chapterId!),
  });

  // Derive published overlays directly from query data (no intermediate state)
  const publishedOverlays = useMemo(
    () => (publishedRows ?? []).map(publishedRowToOverlay),
    [publishedRows],
  );

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

    // Skip OCR when the selected region overlaps an existing translation
    // (published or user-created).  This prevents duplicate overlays and
    // preserves the translator's official translation.
    const pageOverlays = mergedOverlays.filter((o) => o.pageIndex === pageIndex);
    const hit = pageOverlays.find((o) => regionsOverlap(sel.region, o.region));
    if (hit) {
      notify.info('This bubble already has a translation.');
      return;
    }

    setOcr({ phase: 'running', pageIndex, selection: sel, error: null });

    try {
      const { ocrText, translated, romaji, ocrSource, translationProvider } =
        await ocrAndTranslate(imgEl, sel.region);
      if (!ocrText.trim()) {
        setOcr((prev) =>
          prev ? { ...prev, phase: 'error', error: 'No text detected in this region.' } : null
        );
        return;
      }
      
      // Save to private history
      const row = await addHistory.mutateAsync({
        chapterId: chapter.id,
        pageIndex,
        region: sel.region,
        region_hash: regionHash(sel.region),
        ocrText,
        translated,
        romaji,
      });

      const newOverlay: Overlay = {
        ...historyRowToOverlay(row),
        ocrSource,
        translationProvider,
      };
      setUserOverlays((prev) => [newOverlay, ...prev]);
      setOcr(null);
      notify.success('Translation saved');

      // If translator → also publish for readers to see
      if (canPublishTranslations) {
        await upsertChapterTranslation({
          chapter_id: chapter.id,
          page_index: pageIndex,
          region: sel.region,
          region_hash: regionHash(sel.region),
          ocr_text: ocrText,
          translated,
          romaji,
        });

        await queryClient.invalidateQueries({
          queryKey: ['chapter_translations', chapterId],
        });
      }

    } catch (err) {
      setOcr((prev) =>
        prev ? { ...prev, phase: 'error', error: (err as Error).message } : null
      );
    }
  },
  [chapter, addHistory, canPublishTranslations, queryClient, chapterId, mergedOverlays, notify]
);

  // ── Image ref handler ─────────────────────────────────────────
  const handleImageRef = useCallback((pageIndex: number, ref: HTMLImageElement | null) => {
    imageRefs.current[pageIndex] = ref;
  }, []);

  // ── Dismiss overlay + delete from DB ──────────────────────
  const handleDismissOverlay = useCallback(
    async (id: string) => {
      // Find the overlay to determine its source
      const overlay = mergedOverlays.find((o) => o.id === id);
      if (!overlay) return;

      if (overlay.source === 'published') {
        // Delete published translation from chapter_translations table
        try {
          await deleteChapterTranslation(id);
          await queryClient.invalidateQueries({
            queryKey: ['chapter_translations', chapterId],
          });
          notify.success('Translation deleted');
        } catch {
          notify.error('Failed to delete translation');
        }
      } else {
        // Delete from user's private translation_history
        setUserOverlays((prev) => prev.filter((o) => o.id !== id));
        try {
          await deleteHistory.mutateAsync(id);
          // If the translator also published this bubble, delete the published copy
          // in the same operation — prevents it from re-surfacing after history
          // deletion and forcing a second manual delete.
          if (isChapterOwner) {
            const published = publishedOverlays.find((o) => o.key === overlay.key);
            if (published) {
              await deleteChapterTranslation(published.id);
              await queryClient.invalidateQueries({
                queryKey: ['chapter_translations', chapterId],
              });
            }
          }
          notify.success('Translation deleted');
        } catch {
          notify.error('Failed to delete translation');
        }
      }
    },
    [mergedOverlays, publishedOverlays, deleteHistory, chapterId, queryClient, notify, isChapterOwner],
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
          region_hash: ov.region ? regionHash(ov.region) : null,
          original: ov.ocrText,
          translated: ov.translated,
          romaji: ov.romaji,
        });
        notify.success('Saved to Word Vault');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '';
        if (msg === 'already_saved') {
          notify.info('Already saved to Word Vault');
        } else {
          logger.error('[handleSaveToVault] error:', err);
          notify.error('Failed to save to Word Vault. Please try again.');
        }
      }
    },
    [mergedOverlays, chapterId, notify],
  );

  // Only readers can bookmark to Word Vault - translators don't get the bookmark button
  const bookmarkHandler = isTranslator ? undefined : handleSaveToVault;

  // ── Keyboard navigation (page mode only) ─────────────────
  useEffect(() => {
    if (readingMode !== 'page' || images.length === 0) return;
    function onKey(e: KeyboardEvent) {
      // Don't hijack when typing in an input / textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        swiperRef.current?.slideNext();
        setOcr(null);
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        swiperRef.current?.slidePrev();
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

  // ── Toggle selection mode (disabled for read-only viewers) ─
  function toggleSelectionMode() {
    if (isReadOnlyViewer) return;
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
  <div className="min-h-screen bg-white dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col">
    {/* ── Top bar with hamburger menu and centered title ────────── */}
    <header className={`sticky top-0 z-50 flex items-center justify-between px-4 py-3 bg-white/95 dark:bg-gray-950/95 backdrop-blur-md border-b border-gray-200 dark:border-white/10 shadow-sm transition-transform duration-300 ${readingMode === 'page' && !uiVisible ? '-translate-y-full' : 'translate-y-0'}`}>
      
      {/* Left: Back button */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigate(`/manga/${chapter.manga_id}`)}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-indigo-300 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="hidden sm:inline">Back</span>
        </button>
      </div>

      {/* Center: Chapter title */}
      <div className="flex flex-col items-center">
        <h1 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          {chapter?.title || `Chapter ${chapter?.chapter_number}`}
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {readingMode === 'scroll' ? 'Scroll Mode' : 'Page Mode'}
        </p>
      </div>

      {/* Right: Hamburger menu */}
      <div className="flex items-center gap-2">
        {/* Hamburger menu */}
        <div className="relative">
          <button
            onClick={() => setToolsMenuOpen(!toolsMenuOpen)}
            className="p-2 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title="Tools"
          >
            <Menu className="h-4 w-4" />
          </button>

          {/* Dropdown menu */}
          {toolsMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1">
              {/* OCR mode toggle — hidden for readers on shared manga */}
              {!isReadOnlyViewer && (
              <button
                onClick={() => {
                  toggleSelectionMode();
                  setToolsMenuOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <Scan className="h-4 w-4" />
                {selectionMode ? 'Exit OCR' : 'Enable OCR'}
              </button>
              )}

              {/* History toggle */}
              <button
                onClick={() => {
                  setHistoryOpen(!historyOpen);
                  setToolsMenuOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                <History className="h-4 w-4" />
                Translation History
              </button>

              {/* Reading mode toggle */}
              <button
                onClick={() => {
                  toggleReadingMode();
                  setToolsMenuOpen(false);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {readingMode === 'scroll' ? (
                  <>
                    <Square className="h-4 w-4" />
                    Page Mode
                  </>
                ) : (
                  <>
                    <List className="h-4 w-4" />
                    Scroll Mode
                  </>
                )}
              </button>

              {/* Chapter navigation */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
                {prevChapter && (
                  <Link
                    to={`/read/${prevChapter.id}`}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Previous Chapter
                  </Link>
                )}
                {nextChapter && (
                  <Link
                    to={`/read/${nextChapter.id}`}
                    className="flex items-center gap-2 w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    Next Chapter
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      </header>

      {/* Close dropdown when clicking outside */}
      {toolsMenuOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setToolsMenuOpen(false)}
        />
      )}

      <main className="flex-1">
        {selectionMode && (
          <div className="w-full max-w-3xl mx-auto px-4 pt-3">
            <div className="bg-indigo-50 dark:bg-white/5 backdrop-blur-md rounded-xl border border-indigo-300 dark:border-indigo-500/30 px-4 py-2 text-xs text-indigo-700 dark:text-indigo-300 text-center">
              Drag to select a text region on any page — OCR will run automatically.
            </div>
          </div>
        )}

        {extracting && (
          <div className="flex justify-center py-24">
            <LoadingSpinner size="lg" />
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
                  onSaveToVault={bookmarkHandler}
                  isChapterOwner={isChapterOwner}
                  readOnly={isReadOnlyViewer}
                  onImageRef={handleImageRef}
                />
              ))}

              {/* End-of-chapter footer */}
              <div className="w-full py-10 flex flex-col items-center gap-4 border-t border-gray-200 dark:border-white/10 mt-2">
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
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-gray-200 text-sm font-medium transition-colors"
                    >
                      <ArrowLeft className="h-4 w-4" />
                      Back to Manga
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* ── Page mode: one page at a time (Swiper) ── */
            <div className="w-full max-w-3xl mx-auto flex flex-col items-center py-4">
              {/* Swiper page viewer — tap to toggle UI overlay */}
              <Swiper
                dir="rtl"
                initialSlide={currentPage}
                allowTouchMove={!selectionMode}
                onSwiper={(s) => {
                  setSwiperInstance(s);
                  swiperRef.current = s;
                }}
                onSlideChange={(s) => {
                  setCurrentPage(s.realIndex);
                  setOcr(null);
                }}
                onClick={() => {
                  if (!selectionMode) setUiVisible((v) => !v);
                }}
                className="w-full"
              >
                {images.map((src, i) => (
                  <SwiperSlide key={src}>
                    <ReaderPageItem
                      src={src}
                      pageIndex={i}
                      loading={Math.abs(i - currentPage) <= 1 ? 'eager' : 'lazy'}
                      selectionActive={selectionMode}
                      onSelect={handlePageSelect}
                      ocrState={ocr?.pageIndex === i ? ocr : null}
                      onDismissOcr={() => setOcr(null)}
                      overlays={mergedOverlays.filter((o) => o.pageIndex === i)}
                      highlightId={highlightId}
                      onDismissOverlay={handleDismissOverlay}
                      onSaveToVault={bookmarkHandler}
                      isChapterOwner={isChapterOwner}
                      readOnly={isReadOnlyViewer}
                      onImageRef={handleImageRef}
                    />
                  </SwiperSlide>
                ))}
              </Swiper>

              {/* Bottom UI bar — page scrubber + Prev/Next — auto-hides on tap */}
              <div
                className={`w-full flex flex-col items-center gap-2 px-4 py-3 transition-all duration-300 ${
                  uiVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
                }`}
              >
                {/* Range scrubber — RTL to match manga reading direction */}
                {images.length > 1 && (
                  <input
                    type="range"
                    min={0}
                    max={images.length - 1}
                    value={currentPage}
                    onChange={(e) => {
                      const idx = Number(e.target.value);
                      swiperInstance?.slideTo(idx);
                    }}
                    className="w-full max-w-xs accent-indigo-500"
                    style={{ direction: 'rtl' }}
                    aria-label="Jump to page"
                  />
                )}

                {/* Prev / counter / Next */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => { swiperInstance?.slidePrev(); setOcr(null); }}
                    disabled={currentPage === 0}
                    className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="h-4 w-4" />
                    Prev
                  </button>

                  <span className="text-sm text-gray-400 tabular-nums min-w-[5rem] text-center">
                    {currentPage + 1} / {images.length}
                  </span>

                  <button
                    onClick={() => { swiperInstance?.slideNext(); setOcr(null); }}
                    disabled={currentPage === images.length - 1}
                    className="flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-600 dark:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* End-of-chapter footer — only shown on last page */}
              {currentPage === images.length - 1 && (
                <div className="w-full py-8 flex flex-col items-center gap-4 border-t border-gray-200 dark:border-white/10">
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
                        className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gray-100 dark:bg-white/10 hover:bg-gray-200 dark:hover:bg-white/15 text-gray-700 dark:text-gray-200 text-sm font-medium transition-colors"
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
            onSaveToVault={bookmarkHandler ? (entry) => {
              addToWordVault({
                chapter_id: chapterId,
                page_index: entry.page_index,
                region: entry.region,
                region_hash: entry.region_hash,
                original: entry.ocr_text,
                translated: entry.translated,
                romaji: entry.romaji,
              }).then(() => notify.success('Saved to Word Vault'))
                .catch((err: unknown) => {
                  const msg = err instanceof Error ? err.message : '';
                  if (msg === 'already_saved') {
                    notify.info('Already saved to Word Vault');
                  } else {
                    notify.error('Failed to save to Word Vault');
                  }
                });
            } : undefined}
          />
        )}
      </Drawer>

    </div>
  );
}
