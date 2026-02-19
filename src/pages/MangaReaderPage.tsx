import {
  useState,
  useRef,
  useCallback,
  useEffect,
} from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  AlignJustify,
  LayoutGrid,
  ScanText,
  Vault,
  History,
  PanelLeftClose,
  PanelRightClose,
} from 'lucide-react';
import toast from 'react-hot-toast';
import clsx from 'clsx';

import { fetchChapterById, fetchPagesByChapter } from '@/services/chapters';
import {
  runOcrOnRegion,
  translateText,
  fetchTranslationHistory,
  saveTranslationHistory,
  toggleTranslationHistoryVisibility,
} from '@/services/translation';
import { addToWordVault } from '@/services/wordVault';
import { useAuth } from '@/hooks/useAuth';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { ErrorState } from '@/components/ErrorState';
import { OCRSelectionLayer, type SelectionRect } from '@/components/OCRSelectionLayer';
import { TranslationTooltip } from '@/components/TranslationTooltip';
import { WordVaultPanel } from '@/components/WordVaultPanel';
import { Drawer } from '@/components/Drawer';
import type { OcrResult, TranslationHistory, Page, ReadingMode } from '@/types';

export default function MangaReaderPage() {
  const { chapterId } = useParams<{ chapterId: string }>();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // ─── Reading State ─────────────────────────────────────────
  const [mode, setMode] = useState<ReadingMode>('page');
  const [currentPageIdx, setCurrentPageIdx] = useState(0);

  // ─── OCR State ─────────────────────────────────────────────
  const [ocrActive, setOcrActive] = useState(false);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [activeResult, setActiveResult] = useState<OcrResult | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // ─── Panel visibility ──────────────────────────────────────
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [rightTab, setRightTab] = useState<'vault' | 'history'>('history');

  // ─── Data Queries ──────────────────────────────────────────
  const { data: chapter, isLoading: chapterLoading, error: chapterError } = useQuery({
    queryKey: ['chapter', chapterId],
    enabled: !!chapterId,
    queryFn: () => fetchChapterById(chapterId!),
  });

  const { data: pages = [], isLoading: pagesLoading } = useQuery({
    queryKey: ['pages', chapterId],
    enabled: !!chapterId,
    queryFn: () => fetchPagesByChapter(chapterId!),
    staleTime: Infinity,
  });

  const currentPage: Page | undefined = pages[currentPageIdx];

  // ─── Translation History (per page) ───────────────────────
  const { data: history = [], refetch: refetchHistory } = useQuery({
    queryKey: ['translation-history', currentPage?.id, user?.id],
    enabled: !!currentPage && !!user,
    queryFn: () => fetchTranslationHistory(currentPage!.id, user!.id),
  });

  // Reset OCR result on page change
  useEffect(() => {
    setActiveResult(null);
  }, [currentPageIdx]);

  // ─── History visibility toggle mutation ───────────────────
  const toggleMutation = useMutation({
    mutationFn: ({ id, visible }: { id: string; visible: boolean }) =>
      toggleTranslationHistoryVisibility(id, visible),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['translation-history', currentPage?.id, user?.id],
      });
    },
  });

  // ─── Save to Word Vault mutation ──────────────────────────
  const saveVaultMutation = useMutation({
    mutationFn: (result: OcrResult) =>
      addToWordVault({
        userId: user!.id,
        original: result.text,
        translated: result.translated ?? '',
        romaji: result.romaji,
        sourcePageId: currentPage?.id,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['word-vault'] });
      toast.success('Saved to Word Vault!');
    },
    onError: () => toast.error('Failed to save to Word Vault'),
  });

  // ─── OCR Handler ──────────────────────────────────────────
  const handleOCRSelection = useCallback(
    async (sel: SelectionRect) => {
      if (!imageRef.current || !currentPage || !user) return;
      setOcrLoading(true);
      setOcrActive(false); // Exit selection mode after selecting

      try {
        const ocrText = await runOcrOnRegion(imageRef.current, sel.region);
        if (!ocrText) {
          toast.error('No text recognized in that region. Try a clearer area.');
          setOcrLoading(false);
          return;
        }

        const { translated, romaji } = await translateText(ocrText);
        const result: OcrResult = { text: ocrText, translated, romaji, region: sel.region, absBox: sel.absBox };
        setActiveResult(result);

        // Auto-save to translation history
        await saveTranslationHistory({
          userId: user.id,
          pageId: currentPage.id,
          region: sel.region,
          ocrText,
          translated,
          romaji,
        });
        refetchHistory();
      } catch (err) {
        toast.error('OCR failed: ' + (err as Error).message);
      } finally {
        setOcrLoading(false);
      }
    },
    [currentPage, user, refetchHistory]
  );

  // ─── Loading / Error states ────────────────────────────────
  if (chapterLoading || pagesLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-gray-400">Loading chapter…</p>
      </div>
    );
  }

  if (chapterError || !chapter) {
    return (
      <div className="max-w-md mx-auto py-16 px-4">
        <ErrorState title="Chapter not found" message={(chapterError as Error)?.message} />
      </div>
    );
  }

  // ─── Build history overlays for current page ──────────────
  const historyOverlays: (TranslationHistory & { absBox: { left: number; top: number; width: number; height: number } | null })[] =
    history.map((h) => ({ ...h, absBox: null }));

  // ─── Render ────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-[calc(100dvh-56px)] bg-gray-950">
      {/* ── Top bar ── */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-white/10 glass shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>

        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-400 truncate">Chapter {chapter.chapter_number}{chapter.title ? ` — ${chapter.title}` : ''}</p>
        </div>

        {/* Reading mode toggle */}
        <div className="flex gap-1 glass rounded-lg p-0.5">
          <button
            onClick={() => setMode('page')}
            title="Page by Page"
            className={clsx('p-1.5 rounded-md transition-colors', mode === 'page' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white')}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setMode('scroll')}
            title="Vertical Scroll"
            className={clsx('p-1.5 rounded-md transition-colors', mode === 'scroll' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white')}
          >
            <AlignJustify className="h-4 w-4" />
          </button>
        </div>

        {/* OCR toggle */}
        <button
          onClick={() => setOcrActive((v) => !v)}
          disabled={ocrLoading}
          title={ocrActive ? 'Cancel OCR selection' : 'Select region to OCR'}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
            ocrActive
              ? 'bg-indigo-600 text-white'
              : ocrLoading
              ? 'bg-gray-700 text-gray-400 cursor-wait'
              : 'glass text-gray-300 hover:text-white hover:border-indigo-500/50'
          )}
        >
          {ocrLoading ? <LoadingSpinner size="sm" /> : <ScanText className="h-3.5 w-3.5" />}
          {ocrLoading ? 'OCR…' : ocrActive ? 'Cancel' : 'OCR'}
        </button>

        {/* Panel toggles (mobile/desktop) */}
        <button
          onClick={() => { setRightTab('vault'); setRightOpen(true); }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Word Vault"
        >
          <Vault className="h-4 w-4" />
        </button>
        <button
          onClick={() => { setRightTab('history'); setRightOpen(true); }}
          className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Translation History"
        >
          <History className="h-4 w-4" />
        </button>
        <button
          onClick={() => setLeftOpen(true)}
          className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          title="Navigation"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>

      {/* ── Main layout ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Left panel (static on desktop, drawer on mobile) ── */}
        <aside className="hidden lg:flex flex-col w-60 shrink-0 border-r border-white/10 p-4 gap-4 overflow-y-auto">
          <NavigationPanel
            pages={pages}
            currentIdx={currentPageIdx}
            onSelect={setCurrentPageIdx}
            mode={mode}
            setMode={setMode}
          />
        </aside>

        {/* ── Center: manga pages ── */}
        <main className="flex-1 overflow-y-auto relative flex flex-col items-center">
          {mode === 'page' ? (
            <PageView
              pages={pages}
              currentPageIdx={currentPageIdx}
              setCurrentPageIdx={setCurrentPageIdx}
              imageRef={imageRef}
              ocrActive={ocrActive}
              onOCRSelect={handleOCRSelection}
              activeResult={activeResult}
              onDismissResult={() => setActiveResult(null)}
              onSaveToVault={saveVaultMutation.mutate}
              history={historyOverlays}
              onToggleHistory={(id, visible) => toggleMutation.mutate({ id, visible })}
            />
          ) : (
            <ScrollView
              pages={pages}
              ocrActive={ocrActive}
              imageRef={imageRef}
              onOCRSelect={handleOCRSelection}
              activeResult={activeResult}
              onDismissResult={() => setActiveResult(null)}
              onSaveToVault={saveVaultMutation.mutate}
            />
          )}
        </main>

        {/* ── Right panel (static on desktop, drawer on mobile) ── */}
        <aside className="hidden lg:flex flex-col w-72 shrink-0 border-l border-white/10 overflow-y-auto">
          <RightPanelContent
            tab={rightTab}
            setTab={setRightTab}
            history={history}
            onToggleHistory={(id, visible) => toggleMutation.mutate({ id, visible })}
            currentPage={currentPage}
            imageRef={imageRef}
          />
        </aside>
      </div>

      {/* ── Mobile Drawers ── */}
      <Drawer open={leftOpen} onClose={() => setLeftOpen(false)} title="Navigation" side="left">
        <NavigationPanel
          pages={pages}
          currentIdx={currentPageIdx}
          onSelect={(i) => { setCurrentPageIdx(i); setLeftOpen(false); }}
          mode={mode}
          setMode={setMode}
        />
      </Drawer>

      <Drawer open={rightOpen} onClose={() => setRightOpen(false)} title={rightTab === 'vault' ? 'Word Vault' : 'Translation History'} side="right">
        <RightPanelContent
          tab={rightTab}
          setTab={setRightTab}
          history={history}
          onToggleHistory={(id, visible) => toggleMutation.mutate({ id, visible })}
          currentPage={currentPage}
          imageRef={imageRef}
        />
      </Drawer>
    </div>
  );
}

// ─────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────

interface NavPanelProps {
  pages: Page[];
  currentIdx: number;
  onSelect: (i: number) => void;
  mode: ReadingMode;
  setMode: (m: ReadingMode) => void;
}

function NavigationPanel({ pages, currentIdx, onSelect }: NavPanelProps) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">Pages</p>
      <div className="grid grid-cols-4 lg:grid-cols-3 xl:grid-cols-4 gap-1.5">
        {pages.map((p, i) => (
          <button
            key={p.id}
            onClick={() => onSelect(i)}
            className={clsx(
              'aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all',
              i === currentIdx
                ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                : 'border-white/10 hover:border-indigo-500/50'
            )}
            title={`Page ${p.page_number}`}
          >
            <img
              src={p.image_url}
              alt={`Page ${p.page_number}`}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </button>
        ))}
      </div>
    </div>
  );
}

interface PageViewProps {
  pages: Page[];
  currentPageIdx: number;
  setCurrentPageIdx: (i: number) => void;
  imageRef: React.RefObject<HTMLImageElement | null>;
  ocrActive: boolean;
  onOCRSelect: (sel: SelectionRect) => void;
  activeResult: OcrResult | null;
  onDismissResult: () => void;
  onSaveToVault: (r: OcrResult) => void;
  history: (TranslationHistory & { absBox: { left: number; top: number; width: number; height: number } | null })[];
  onToggleHistory: (id: string, visible: boolean) => void;
}

function PageView({
  pages,
  currentPageIdx,
  setCurrentPageIdx,
  imageRef,
  ocrActive,
  onOCRSelect,
  activeResult,
  onDismissResult,
  onSaveToVault,
  history,
  onToggleHistory,
}: PageViewProps) {
  const page = pages[currentPageIdx];
  const containerRef = useRef<HTMLDivElement>(null);

  if (!page) return <p className="text-gray-500 mt-8">No pages available.</p>;

  return (
    <div className="flex flex-col items-center w-full px-2 py-4 gap-4">
      {/* Page counter */}
      <p className="text-xs text-gray-500">
        Page {page.page_number} of {pages.length}
      </p>

      {/* Image + OCR layer */}
      <div ref={containerRef} className="relative max-w-2xl w-full">
        <OCRSelectionLayer
          active={ocrActive}
          onSelect={onOCRSelect}
          imageRef={imageRef}
        >
          <img
            ref={imageRef}
            src={page.image_url}
            alt={`Page ${page.page_number}`}
            className="w-full rounded-xl shadow-2xl"
            draggable={false}
          />

          {/* History overlays */}
          {history.map((h) => {
            if (!imageRef.current) return null;
            const rect = imageRef.current.getBoundingClientRect();
            const absBox = {
              left: h.region_x * rect.width,
              top: h.region_y * rect.height,
              width: h.region_w * rect.width,
              height: h.region_h * rect.height,
            };
            return (
              <TranslationTooltip
                key={h.id}
                result={{
                  text: h.ocr_text,
                  translated: h.translated,
                  romaji: h.romaji,
                  region: { x: h.region_x, y: h.region_y, w: h.region_w, h: h.region_h },
                  absBox,
                }}
                isHistory
                visible={h.visible}
                onToggleVisible={() => onToggleHistory(h.id, !h.visible)}
                onSaveToVault={() => {}}
                onDismiss={() => {}}
              />
            );
          })}

          {/* Active OCR result */}
          {activeResult && (
            <TranslationTooltip
              result={activeResult}
              onSaveToVault={onSaveToVault}
              onDismiss={onDismissResult}
            />
          )}
        </OCRSelectionLayer>
      </div>

      {/* Navigation arrows */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => setCurrentPageIdx(Math.max(0, currentPageIdx - 1))}
          disabled={currentPageIdx === 0}
          className="flex items-center gap-1 px-4 py-2 rounded-xl glass border border-white/10 text-sm text-gray-300 hover:text-white disabled:opacity-30 hover:border-indigo-500/50 transition-all"
        >
          <ChevronLeft className="h-4 w-4" />
          Prev
        </button>

        {/* Page dots */}
        <div className="flex gap-1.5">
          {pages.map((_, i) => (
            <button
              key={i}
              onClick={() => setCurrentPageIdx(i)}
              className={clsx(
                'rounded-full transition-all',
                i === currentPageIdx
                  ? 'w-4 h-2 bg-indigo-400'
                  : 'w-2 h-2 bg-gray-600 hover:bg-gray-400'
              )}
            />
          ))}
        </div>

        <button
          onClick={() => setCurrentPageIdx(Math.min(pages.length - 1, currentPageIdx + 1))}
          disabled={currentPageIdx === pages.length - 1}
          className="flex items-center gap-1 px-4 py-2 rounded-xl glass border border-white/10 text-sm text-gray-300 hover:text-white disabled:opacity-30 hover:border-indigo-500/50 transition-all"
        >
          Next
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Keyboard nav hint */}
      <p className="text-xs text-gray-600">
        Use ← → arrow keys or buttons to navigate pages
      </p>
    </div>
  );
}

interface ScrollViewProps {
  pages: Page[];
  ocrActive: boolean;
  imageRef: React.RefObject<HTMLImageElement | null>;
  onOCRSelect: (sel: SelectionRect) => void;
  activeResult: OcrResult | null;
  onDismissResult: () => void;
  onSaveToVault: (r: OcrResult) => void;
}

function ScrollView({
  pages,
  ocrActive,
  imageRef,
  onOCRSelect,
  activeResult,
  onDismissResult,
  onSaveToVault,
}: ScrollViewProps) {
  return (
    <div className="flex flex-col items-center gap-2 px-2 py-4 max-w-2xl mx-auto w-full">
      {pages.map((page, i) => (
        <div key={page.id} className="relative w-full">
          <OCRSelectionLayer
            active={ocrActive}
            onSelect={onOCRSelect}
            imageRef={i === 0 ? imageRef : { current: null }}
          >
            <img
              ref={i === 0 ? imageRef : undefined}
              src={page.image_url}
              alt={`Page ${page.page_number}`}
              className="w-full rounded-xl shadow-xl"
              loading="lazy"
              draggable={false}
            />
            {/* Only show active result on first page in scroll mode for simplicity */}
            {i === 0 && activeResult && (
              <TranslationTooltip
                result={activeResult}
                onSaveToVault={onSaveToVault}
                onDismiss={onDismissResult}
              />
            )}
          </OCRSelectionLayer>
        </div>
      ))}
    </div>
  );
}

interface RightPanelProps {
  tab: 'vault' | 'history';
  setTab: (t: 'vault' | 'history') => void;
  history: TranslationHistory[];
  onToggleHistory: (id: string, visible: boolean) => void;
  currentPage: Page | undefined;
  imageRef: React.RefObject<HTMLImageElement | null>;
}

function RightPanelContent({ tab, setTab, history, onToggleHistory }: RightPanelProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex border-b border-white/10 shrink-0">
        {([['history', 'History'], ['vault', 'Word Vault']] as const).map(([id, label]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={clsx(
              'flex-1 py-3 text-xs font-medium transition-colors',
              tab === id ? 'text-indigo-300 border-b-2 border-indigo-400' : 'text-gray-400 hover:text-white'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'vault' ? (
          <WordVaultPanel />
        ) : (
          <HistoryList history={history} onToggle={onToggleHistory} />
        )}
      </div>
    </div>
  );
}

function HistoryList({
  history,
  onToggle,
}: {
  history: TranslationHistory[];
  onToggle: (id: string, visible: boolean) => void;
}) {
  if (history.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-8 text-center">
        <History className="h-8 w-8 text-gray-600" />
        <p className="text-sm text-gray-500">No translations on this page yet.</p>
        <p className="text-xs text-gray-600">Enable OCR mode and select a speech bubble.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {history.map((h) => (
        <li key={h.id} className="glass rounded-xl border border-white/10 p-3 text-xs">
          <div className="flex items-center justify-between mb-1">
            <span className="text-gray-500 font-medium">Saved Translation</span>
            <button
              onClick={() => onToggle(h.id, !h.visible)}
              className={clsx(
                'px-2 py-0.5 rounded-full text-xs font-medium transition-colors',
                h.visible
                  ? 'bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30'
                  : 'bg-gray-700/50 text-gray-500 hover:bg-gray-700'
              )}
            >
              {h.visible ? 'ON' : 'OFF'}
            </button>
          </div>
          <p className="font-mono text-gray-300 break-words">{h.ocr_text}</p>
          {h.translated && <p className="text-green-300 mt-1 break-words">{h.translated}</p>}
          {h.romaji && <p className="text-blue-300 italic mt-0.5">{h.romaji}</p>}
        </li>
      ))}
    </ul>
  );
}

// ─── Keyboard navigation ──────────────────────────────────────
// (exported; used in the main component via useEffect)
export function useKeyboardNav(
  mode: ReadingMode,
  currentIdx: number,
  total: number,
  setIdx: (i: number) => void
) {
  useEffect(() => {
    if (mode !== 'page') return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        setIdx(Math.min(total - 1, currentIdx + 1));
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        setIdx(Math.max(0, currentIdx - 1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [mode, currentIdx, total, setIdx]);
}
