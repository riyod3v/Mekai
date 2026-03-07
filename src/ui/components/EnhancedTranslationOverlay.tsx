import { useEffect, useRef, useCallback, useState } from 'react';
import { X, Star, BookOpen, Volume2 } from 'lucide-react';
import clsx from 'clsx';
import type { RegionBox } from '@/types';
import type { TranslationProvider } from '@/lib/translate';

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

// ─── Canvas text-fit helpers ──────────────────────────────────

const FONT_FAMILY = '"Arial", "Helvetica", sans-serif';
const TEXT_COLOR = '#111';

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
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

function drawFittedText(canvas: HTMLCanvasElement, text: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  ctx.clearRect(0, 0, W, H);

  if (!text.trim()) return;

  const padX = W * 0.08;
  const padY = H * 0.08;
  const maxW = W - padX * 2;
  const maxH = H - padY * 2;

  const initSize = Math.max(H * 0.18, 12);
  const minSize = Math.max(H * 0.08, 12);

  let fontSize = initSize;
  let lines: string[] = [];

  while (fontSize >= minSize) {
    ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
    lines = wrapWords(ctx, text, maxW);
    const lineHeight = fontSize * 1.25;
    if (lines.length * lineHeight <= maxH) break;
    fontSize -= 0.5;
  }

  fontSize = Math.max(fontSize, minSize);
  ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
  lines = wrapWords(ctx, text, maxW);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = TEXT_COLOR;

  const lineHeight = fontSize * 1.25;
  const totalHeight = lines.length * lineHeight;
  const startY = (H + (lines.length - 1) * lineHeight) / 2;

  lines.forEach((line, i) => {
    const y = startY - i * lineHeight;
    if (y < fontSize || y > H - fontSize) {
      const truncated = ctx.measureText(line).width > maxW - 20;
      const display = truncated ? line.slice(0, -3) + '…' : line;
      ctx.fillText(display, W / 2, y);
    } else {
      ctx.fillText(line, W / 2, y);
    }
  });
}

export function EnhancedTranslationOverlay({
  id,
  region,
  translated,
  romaji,
  ocrText,
  ocrSource,
  translationProvider,
  highlighted = false,
  readOnly = false,
  onDismiss,
  onSaveToVault,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  // Draw text whenever it changes
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use ResizeObserver to re-render on size changes
    const ro = new ResizeObserver(() => {
      drawFittedText(canvas, translated);
    });
    ro.observe(canvas);
    drawFittedText(canvas, translated);

    return () => ro.disconnect();
  }, [translated]);

  // Handle save to vault
  const handleSaveToVault = useCallback(() => {
    if (onSaveToVault && !isSaved) {
      onSaveToVault(id);
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2000); // Reset after 2s
    }
  }, [id, onSaveToVault, isSaved]);

  // Handle text-to-speech
  const handleSpeak = useCallback(() => {
    try {
      if ('speechSynthesis' in window && romaji) {
        // Cancel any ongoing speech
        window.speechSynthesis.cancel();
        
        const utterance = new SpeechSynthesisUtterance(romaji);
        utterance.lang = 'ja-JP';
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
      }
    } catch (error) {
      console.warn('Text-to-speech not available:', error);
    }
  }, [romaji]);

  return (
    <div
      className={clsx(
        'absolute group',
        highlighted && 'ring-2 ring-blue-400 ring-offset-2 ring-offset-white'
      )}
      style={{
        left: `${region.x * 100}%`,
        top: `${region.y * 100}%`,
        width: `${region.w * 100}%`,
        height: `${region.h * 100}%`,
      }}
    >
      {/* Canvas with fitted text */}
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          imageRendering: 'crisp-edges',
        }}
      />

      {/* Hover controls */}
      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
        <div className="bg-black/75 text-white rounded-lg p-1 flex items-center gap-1">
          {/* Save to Word Vault */}
          {onSaveToVault && !readOnly && (
            <button
              onClick={handleSaveToVault}
              className={clsx(
                'p-1 rounded hover:bg-white/20 transition-colors',
                isSaved && 'text-green-400'
              )}
              title={isSaved ? 'Saved!' : 'Save to Word Vault'}
            >
              <Star className={clsx('w-4 h-4', isSaved && 'fill-current')} />
            </button>
          )}

          {/* Text-to-speech for romaji */}
          {romaji && (
            <button
              onClick={handleSpeak}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              title="Pronounce (romaji)"
            >
              <Volume2 className="w-4 h-4" />
            </button>
          )}

          {/* Show details */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="p-1 rounded hover:bg-white/20 transition-colors"
            title="Show details"
          >
            <BookOpen className="w-4 h-4" />
          </button>

          {/* Dismiss */}
          {!readOnly && (
            <button
              onClick={() => onDismiss(id)}
              className="p-1 rounded hover:bg-white/20 transition-colors"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Details popup */}
      {showDetails && (
        <div className="absolute bottom-full left-0 mb-2 bg-white border border-gray-200 rounded-lg shadow-lg p-3 z-50 min-w-max">
          <div className="space-y-2 text-sm">
            {ocrText && (
              <div>
                <span className="font-semibold text-gray-600">Original:</span>
                <p className="text-gray-900">{ocrText}</p>
              </div>
            )}
            <div>
              <span className="font-semibold text-gray-600">Translation:</span>
              <p className="text-gray-900">{translated}</p>
            </div>
            {romaji && (
              <div>
                <span className="font-semibold text-gray-600">Romaji:</span>
                <p className="text-gray-900">{romaji}</p>
              </div>
            )}
            <div className="flex gap-2 text-xs text-gray-500">
              {ocrSource && <span>OCR: {ocrSource}</span>}
              {translationProvider && <span>TL: {translationProvider}</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
