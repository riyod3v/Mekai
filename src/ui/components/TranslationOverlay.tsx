import { useEffect, useRef, useCallback } from 'react';
import { X, Star } from 'lucide-react';
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
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

/**
 * Render `text` onto `canvas` with automatic shrink-to-fit:
 *   • Starts at initialFontSize (= height × 0.18), minimum 12 px.
 *   • Shrinks in 0.5 px steps until the wrapped block fits inside the
 *     padded area or reaches minFontSize (= height × 0.08, min 12 px).
 *   • If text still overflows at minimum size, lines are truncated with "…".
 *   • All drawing is clipped to the canvas rect — text never spills outside.
 *   • Text is centred horizontally and vertically.
 */
function drawFittedText(canvas: HTMLCanvasElement, text: string): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;

  // Clear
  ctx.clearRect(0, 0, W, H);

  if (!text.trim()) return;

  const padX = W * 0.08;
  const padY = H * 0.08;
  const maxW  = W - padX * 2;
  const maxH  = H - padY * 2;

  const initSize = Math.max(H * 0.18, 12);
  const minSize  = Math.max(H * 0.08, 12);

  let fontSize = initSize;
  let lines: string[] = [];

  // Shrink until the text block fits
  while (fontSize >= minSize) {
    ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
    lines = wrapWords(ctx, text, maxW);
    const lineHeight = fontSize * 1.25;
    if (lines.length * lineHeight <= maxH) break;
    fontSize -= 0.5;
  }

  // Clamp to minimum regardless
  fontSize = Math.max(fontSize, minSize);
  ctx.font = `600 ${fontSize}px ${FONT_FAMILY}`;
  lines = wrapWords(ctx, text, maxW);

  const lineHeight = fontSize * 1.25;

  // If still overflowing at minimum font size, truncate lines with "…"
  const maxLines = Math.max(Math.floor(maxH / lineHeight), 1);
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    // Trim last visible line until "…" fits within maxW
    let last = lines[lines.length - 1] + '\u2026';
    while (last.length > 1 && ctx.measureText(last).width > maxW) {
      last = last.slice(0, -2) + '\u2026';
    }
    lines[lines.length - 1] = last;
  }

  const blockH = lines.length * lineHeight;
  const startY = (H - blockH) / 2 + fontSize * 0.85; // baseline of first line

  // Clip to canvas bounds — text can never spill outside the overlay rect
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

// ─── Component ────────────────────────────────────────────────

/**
 * Scanlate-style in-bubble translation overlay.
 *
 * Renders a solid white rounded rectangle inside the user-selected bbox with
 * the English translation word-wrapped and shrink-to-fit using canvas
 * measureText.  Debug metadata (ocrSource, translationProvider, romaji,
 * ocrText) is accepted as props and preserved for storage but not shown.
 *
 * Action buttons (dismiss / save) appear on hover so they don't occlude text.
 */
export function TranslationOverlay({
  id, region, translated, ocrText,
  // Accepted for type-compatibility / storage — not rendered
  ocrSource: _ocrSource,
  translationProvider: _translationProvider,
  romaji: _romaji,
  highlighted = false, readOnly = false, onDismiss, onSaveToVault,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawFittedText(canvas, translated);
  }, [translated]);

  // Re-render whenever the canvas element is resized (bubble pixel size changes
  // as the reader scales the page, e.g. window resize or zoom).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      // Update canvas resolution to match its CSS size
      canvas.width  = Math.max(Math.round(width),  1);
      canvas.height = Math.max(Math.round(height), 1);
      render();
    });

    ro.observe(canvas);
    return () => ro.disconnect();
  }, [render]);

  const style: React.CSSProperties = {
    position: 'absolute',
    left:   `${region.x * 100}%`,
    top:    `${region.y * 100}%`,
    width:  `${region.w * 100}%`,
    height: `${region.h * 100}%`,
    zIndex: 20,
    boxSizing: 'border-box',
  };

  return (
    <div style={style} className="group">
      <div
        style={{ width: '100%', height: '100%' }}
        className={clsx(
          'relative rounded-lg overflow-hidden',
          'bg-white shadow-md',
          highlighted && 'ring-2 ring-yellow-400 ring-offset-0 animate-pulse',
        )}
      >
        {/* Action buttons — visible on hover only */}
        <div className="absolute top-0.5 right-0.5 z-10 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {onSaveToVault && ocrText && (
            <button
              onClick={(e) => { e.stopPropagation(); onSaveToVault(id); }}
              className="p-0.5 rounded bg-white/90 text-gray-400 hover:text-yellow-500 transition-colors"
              title="Save to Word Vault"
            >
              <Star className="h-2.5 w-2.5" />
            </button>
          )}
          {!readOnly && (
            <button
              onClick={(e) => { e.stopPropagation(); onDismiss(id); }}
              className="p-0.5 rounded bg-white/90 text-gray-400 hover:text-red-500 transition-colors"
              title="Remove overlay"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        {/* Canvas fills the entire bubble; drawFittedText handles all layout */}
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%' }}
        />
      </div>
    </div>
  );
}


