import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Star, Volume2, ChevronUp, X, Copy, Check, Sparkles } from 'lucide-react';
import { logger } from '@/lib/utils/logger';
import clsx from 'clsx';
import type { RegionBox } from '@/types';
import type { TranslationProvider } from '@/lib/translate/translate';
import { explainJapaneseSentence, isOpenRouterConfigured } from '@/lib/api/openrouter';

interface Props {
  id: string;
  region: RegionBox;
  translated: string;
  romaji: string | null;
  /** Original OCR Japanese text — used for word vault save */
  ocrText?: string;
  /** Which OCR engine produced ocrText (stored; not rendered in normal mode) */
  ocrSource?: 'manga-ocr';
  /** Which translation provider produced translated (stored; not rendered in normal mode) */
  translationProvider?: TranslationProvider;
  /** Whether this overlay is being highlighted from the History panel */
  highlighted?: boolean;
  /** Whether overlay is read-only (published translation viewed by a reader) */
  readOnly?: boolean;
  onDismiss: (id: string) => void;
  /** Called when user clicks the ★ Save button to bookmark to word vault */
  onSaveToVault?: (id: string) => void;
}

const FONT_FAMILY = '"Segoe UI", "Arial", "Helvetica", sans-serif';
const TEXT_COLOR  = '#111';

/**
 * Split `text` into lines so that no line exceeds `maxWidth` using the
 * font already set on `ctx`.  Splits on whitespace; very long words are
 * left on their own line rather than being broken mid-word.
 */
function wrapWords(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      // If a single word is wider than maxWidth, break it
      if (ctx.measureText(word).width > maxWidth) {
        let remaining = word;
        while (remaining.length > 0) {
          let end = remaining.length;
          while (end > 1 && ctx.measureText(remaining.slice(0, end)).width > maxWidth) {
            end--;
          }
          lines.push(remaining.slice(0, end));
          remaining = remaining.slice(end);
        }
        current = '';
      } else {
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * Render `text` onto `canvas` with automatic shrink-to-fit.
 * Text is centred horizontally and vertically, clipped to canvas bounds.
 */
function drawFittedText(canvas: HTMLCanvasElement, text: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  // Clear
  ctx.clearRect(0, 0, W, H);

  if (!text.trim()) return;

  const padX = Math.max(W * 0.06, 4);
  const padY = Math.max(H * 0.06, 4);
  const maxW  = W - padX * 2;
  const maxH  = H - padY * 2;

  if (maxW <= 0 || maxH <= 0) return;

  // Start with a reasonable font size relative to the box
  const initSize = Math.max(Math.min(H * 0.22, W * 0.15), 10);
  const minSize  = Math.max(Math.min(H * 0.08, 10), 8);

  let fontSize = initSize;
  let lines: string[] = [];
  let lineHeight = fontSize * 1.2;

  // Shrink until the text block fits
  while (fontSize >= minSize) {
    ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
    lines = wrapWords(ctx, text, maxW);
    lineHeight = fontSize * 1.2;
    if (lines.length * lineHeight <= maxH) break;
    fontSize -= 0.5;
  }

  // Clamp to minimum regardless
  fontSize = Math.max(fontSize, minSize);
  ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
  lines = wrapWords(ctx, text, maxW);
  lineHeight = fontSize * 1.2;

  // If still overflowing at minimum font size, truncate lines with "…"
  const maxLines = Math.max(Math.floor(maxH / lineHeight), 1);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[lines.length - 1] + '\u2026';
    while (last.length > 1 && ctx.measureText(last).width > maxW) {
      last = last.slice(0, -2) + '\u2026';
    }
    lines[lines.length - 1] = last;
  }

  const blockH = lines.length * lineHeight;
  const startY = (H - blockH) / 2 + fontSize * 0.85;

  // Clip to canvas bounds
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, W, H);
  ctx.clip();

  ctx.fillStyle = TEXT_COLOR;
  ctx.textAlign  = 'center';
  ctx.textBaseline = 'alphabetic';

  lines.forEach((line, i) => {
    ctx.fillText(line, W / 2, startY + i * lineHeight);
  });

  ctx.restore();
}

interface DetailsSheetProps {
  ocrText?: string;
  translated: string;
  romaji: string | null;
  ocrSource?: string;
  translationProvider?: string;
  onClose: () => void;
  onSpeak: () => void;
  onSaveToVault?: () => void;
  onDelete?: () => void;
  readOnly: boolean;
  onExplain?: () => void;
  aiExplanation?: string | null;
  isExplaining?: boolean;
}

function DetailsSheet({
  ocrText, translated, romaji, ocrSource, translationProvider,
  onClose, onSpeak, onSaveToVault, onDelete, readOnly,
  onExplain, aiExplanation, isExplaining,
}: DetailsSheetProps) {
  const [copied, setCopied] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  const handleCopy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API not available
    }
  }, []);

  // Close on Escape key
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Swipe down functionality
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    const handleTouchStart = (e: TouchEvent) => {
      startY.current = e.touches[0].clientY;
      isDragging.current = true;
      sheet.style.transition = 'none';
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDragging.current) return;
      
      currentY.current = e.touches[0].clientY;
      const deltaY = currentY.current - startY.current;
      
      if (deltaY > 0) {
        sheet.style.transform = `translateY(${deltaY}px)`;
      }
    };

    const handleTouchEnd = () => {
      if (!isDragging.current) return;
      
      isDragging.current = false;
      const deltaY = currentY.current - startY.current;
      
      sheet.style.transition = 'transform 0.3s ease-out';
      
      if (deltaY > 150) {
        // Swipe down far enough, close the sheet
        sheet.style.transform = 'translateY(100%)';
        setTimeout(onClose, 300);
      } else {
        // Snap back to position
        sheet.style.transform = 'translateY(0)';
      }
      
      startY.current = 0;
      currentY.current = 0;
    };

    // Mouse events for desktop
    const handleMouseDown = (e: MouseEvent) => {
      startY.current = e.clientY;
      isDragging.current = true;
      sheet.style.transition = 'none';
      e.preventDefault();
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      
      currentY.current = e.clientY;
      const deltaY = currentY.current - startY.current;
      
      if (deltaY > 0) {
        sheet.style.transform = `translateY(${deltaY}px)`;
      }
    };

    const handleMouseUp = () => {
      if (!isDragging.current) return;
      
      isDragging.current = false;
      const deltaY = currentY.current - startY.current;
      
      sheet.style.transition = 'transform 0.3s ease-out';
      
      if (deltaY > 150) {
        // Drag down far enough, close the sheet
        sheet.style.transform = 'translateY(100%)';
        setTimeout(onClose, 300);
      } else {
        // Snap back to position
        sheet.style.transform = 'translateY(0)';
      }
      
      startY.current = 0;
      currentY.current = 0;
    };

    // Touch events
    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: true });
    sheet.addEventListener('touchend', handleTouchEnd);
    
    // Mouse events for desktop
    sheet.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      sheet.removeEventListener('touchstart', handleTouchStart);
      sheet.removeEventListener('touchmove', handleTouchMove);
      sheet.removeEventListener('touchend', handleTouchEnd);
      sheet.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [onClose]);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[9998] bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />

      {/* Bottom sheet */}
      <div className="fixed inset-x-0 bottom-0 z-[9999] w-full">
        <div 
          ref={sheetRef}
          className="w-full max-w-lg mx-auto bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl border-t border-gray-200 dark:border-gray-700 overflow-hidden animate-slide-up"
        >
          {/* Handle bar */}
          <div className="flex items-center justify-center px-4 pt-3 pb-2 cursor-grab active:cursor-grabbing">
            <div className="w-10 h-1 rounded-full bg-gray-300 dark:bg-gray-600" />
          </div>

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors z-10"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Content */}
          <div className="px-5 pb-5 space-y-3 max-h-[80vh] overflow-y-auto">
            {/* Original Japanese text */}
            {ocrText && (
              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  Original
                </span>
                <p className="text-base text-gray-900 dark:text-gray-100 font-medium leading-relaxed mt-0.5">
                  {ocrText}
                </p>
              </div>
            )}

            {/* Translated text */}
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  Translation
                </span>
                <button
                  onClick={() => handleCopy(translated)}
                  className="p-1 rounded text-gray-400 hover:text-indigo-500 transition-colors"
                  title="Copy translation"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </button>
              </div>
              <p className="text-base text-gray-900 dark:text-gray-100 leading-relaxed mt-0.5">
                {translated}
              </p>
            </div>

            {/* Romaji / Pronunciation */}
            {romaji && (
              <div>
                <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                  Pronunciation
                </span>
                <div className="flex items-center gap-2 mt-0.5">
                  <p className="text-base text-indigo-600 dark:text-indigo-400 italic leading-relaxed flex-1">
                    {romaji}
                  </p>
                  <button
                    onClick={onSpeak}
                    className="p-2 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors shrink-0"
                    title="Pronounce"
                  >
                    <Volume2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
            )}

            {/* AI Explanation */}
            {ocrText && onExplain && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                    AI Explanation
                  </span>
                  {!aiExplanation && (
                    <button
                      onClick={onExplain}
                      disabled={isExplaining}
                      className="flex items-center gap-1 text-xs px-2 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 rounded-lg hover:bg-purple-100 dark:hover:bg-purple-900/40 transition-colors disabled:opacity-50"
                    >
                      <Sparkles className="h-3 w-3" />
                      {isExplaining ? 'Explaining...' : 'Explain'}
                    </button>
                  )}
                </div>
                {aiExplanation && (
                  <div className="text-sm text-gray-700 dark:text-gray-300 bg-purple-50/50 dark:bg-purple-900/10 rounded-lg p-3 whitespace-pre-wrap leading-relaxed">
                    {aiExplanation}
                  </div>
                )}
              </div>
            )}

            {/* Meta info + actions */}
            <div className="flex items-center gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              {ocrSource && (
                <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                  {ocrSource}
                </span>
              )}
              {translationProvider && (
                <span className="text-[10px] px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 rounded-full">
                  {translationProvider}
                </span>
              )}

              <div className="ml-auto flex items-center gap-2">
                {onSaveToVault && (
                  <button
                    onClick={onSaveToVault}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-600 dark:text-yellow-400 rounded-lg hover:bg-yellow-100 dark:hover:bg-yellow-900/40 transition-colors"
                  >
                    <Star className="h-3 w-3" />
                    Save
                  </button>
                )}
                {!readOnly && onDelete && (
                  <button
                    onClick={onDelete}
                    className="flex items-center gap-1 text-xs px-3 py-1.5 bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}

export function TranslationOverlay({
  id, region, translated, ocrText,
  ocrSource: _ocrSource,
  translationProvider: _translationProvider,
  romaji,
  highlighted = false, readOnly = false, onDismiss, onSaveToVault,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [aiExplanation, setAiExplanation] = useState<string | null>(null);
  const [isExplaining, setIsExplaining] = useState(false);

  const handleExplain = useCallback(async () => {
    if (!ocrText || !isOpenRouterConfigured()) return;
    
    setIsExplaining(true);
    try {
      const explanation = await explainJapaneseSentence(ocrText);
      setAiExplanation(explanation);
    } catch (error) {
      logger.error('[TranslationOverlay] AI explanation failed:', error);
      setAiExplanation('AI explanation unavailable. Please check your API configuration.');
    } finally {
      setIsExplaining(false);
    }
  }, [ocrText]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawFittedText(canvas, translated);
  }, [translated]);

  // Re-render whenever the canvas element is resized
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      canvas.width  = Math.max(Math.round(width),  1);
      canvas.height = Math.max(Math.round(height), 1);
      render();
    });

    ro.observe(canvas);
    return () => ro.disconnect();
  }, [render]);

  // Text-to-speech for romaji pronunciation
  const handleSpeak = useCallback(() => {
    try {
      if ('speechSynthesis' in window && romaji) {
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(romaji);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      logger.warn('[TranslationOverlay] Text-to-speech not available:', error);
    }
  }, [romaji]);

  const style: React.CSSProperties = {
    position: 'absolute',
    left:   `${region.x * 100}%`,
    top:    `${region.y * 100}%`,
    width:  `${region.w * 100}%`,
    height: `${region.h * 100}%`,
    zIndex: 20,
    boxSizing: 'border-box',
    // Always LTR — translation text must never inherit the Swiper's RTL direction
    direction: 'ltr',
  };

  return (
    <div style={style} className="group">
      <div
        style={{ width: '100%', height: '100%' }}
        className={clsx(
          'relative rounded-lg overflow-visible',
          'bg-white shadow-md',
          highlighted && 'ring-2 ring-yellow-400 ring-offset-0 animate-pulse',
        )}
      >
        {/* Action buttons — visible on hover */}
        <div className="absolute top-0.5 right-0.5 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {/* Pronunciation button */}
          {romaji && (
            <button
              onClick={(e) => { e.stopPropagation(); handleSpeak(); }}
              className="p-0.5 rounded bg-white/90 text-gray-400 hover:text-blue-500 transition-colors"
              title="Pronounce"
            >
              <Volume2 className="h-2.5 w-2.5" />
            </button>
          )}
          {/* Save to vault */}
          {onSaveToVault && ocrText && (
            <button
              onClick={(e) => { e.stopPropagation(); onSaveToVault(id); }}
              className="p-0.5 rounded bg-white/90 text-gray-400 hover:text-yellow-500 transition-colors"
              title="Save to Word Vault"
            >
              <Star className="h-2.5 w-2.5" />
            </button>
          )}
          {/* Details toggle */}
          <button
            onClick={(e) => { e.stopPropagation(); setShowDetails(!showDetails); }}
            className="p-0.5 rounded bg-white/90 text-gray-400 hover:text-indigo-500 transition-colors"
            title="Show details"
          >
            <ChevronUp className={clsx('h-2.5 w-2.5 transition-transform', showDetails && 'rotate-180')} />
          </button>
          {/* Delete button */}
          {!readOnly && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(id); }}
              className="p-0.5 rounded bg-white/90 text-gray-400 hover:text-red-500 transition-colors"
              title="Delete translation"
            >
              <Trash2 className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        {/* Canvas fills the entire bubble */}
        <canvas
          ref={canvasRef}
          onClick={() => setShowDetails(!showDetails)}
          className="cursor-pointer"
          style={{ display: 'block', width: '100%', height: '100%' }}
        />

        {/* Details panel — portalled as a bottom sheet so it never overlaps page elements */}
        {showDetails && (
          <DetailsSheet
            ocrText={ocrText}
            translated={translated}
            romaji={romaji}
            ocrSource={_ocrSource}
            translationProvider={_translationProvider}
            onClose={() => setShowDetails(false)}
            onSpeak={handleSpeak}
            onSaveToVault={onSaveToVault && ocrText ? () => onSaveToVault(id) : undefined}
            onDelete={!readOnly ? () => { setShowDetails(false); onDismiss(id); } : undefined}
            readOnly={readOnly}
            onExplain={isOpenRouterConfigured() ? handleExplain : undefined}
            aiExplanation={aiExplanation}
            isExplaining={isExplaining}
          />
        )}
      </div>
    </div>
  );
}
