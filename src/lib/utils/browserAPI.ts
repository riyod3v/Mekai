// src/lib/utils/browserAPI.ts
import { type BBox, cropToDataUrl, hasInkContent } from '@/lib/ocr/ocr';
import { translateJapaneseToEnglishWithProvider } from '@/lib/translate/translate';
import { toRomaji } from '@/lib/translate/romaji';
import { isMangaOcrAvailable, localMangaOcr } from '@/lib/api/manga-ocr-py-API';
import type { TranslationProvider } from '@/lib/translate/translate';

// ─── OCR request lock ────────────────────────────────────────
// Prevents concurrent OCR requests from flooding Railway's 512 MB container.
// Only one OCR+translate pipeline may run at a time; subsequent calls are
// rejected immediately so the UI can show "busy" feedback.
let _ocrRunning = false;
const _OCR_COOLDOWN_MS = 1_000;
let _lastOcrFinished = 0;

// ─── Public types ─────────────────────────────────────────────

export type OcrTranslateResult = {
  ocrText: string;
  translated: string;
  romaji: string | null;
  /** Which OCR engine produced the text. */
  ocrSource: 'manga-ocr';
  /** Which translation provider produced the translation. */
  translationProvider: TranslationProvider;
};

// ─── Public API ───────────────────────────────────────────────

/**
 * Run OCR on a selected region of a manga page, then translate and
 * convert to Romaji.
 *
 * Both OCR and translation use the local py-mekai-api companion server.
 * Throws if either service is unavailable.
 * @param imgEl - The fully-loaded source HTMLImageElement.
 * @param bbox  - Normalised bounding box { x, y, w, h } (0..1).
 * @returns     OCR text, English translation, and Romaji.
 */
export async function ocrAndTranslate(
  imgEl: HTMLImageElement,
  bbox: BBox,
): Promise<OcrTranslateResult> {
  const ocrSource: OcrTranslateResult['ocrSource'] = 'manga-ocr';
  const emptyResult: OcrTranslateResult = {
    ocrText: '', translated: '', romaji: null, ocrSource, translationProvider: 'py-mekai-api',
  };

  // ── Request lock: reject if another OCR is already in flight ──
  if (_ocrRunning) {
    console.warn('[mekai] OCR request skipped — another is still running');
    return emptyResult;
  }

  // ── Cooldown: enforce minimum gap between requests ──
  const sinceLastOcr = Date.now() - _lastOcrFinished;
  if (sinceLastOcr < _OCR_COOLDOWN_MS) {
    console.warn('[mekai] OCR request skipped — cooldown active');
    return emptyResult;
  }

  // Pre-flight: skip OCR entirely if region has no detectable ink
  if (!hasInkContent(imgEl, bbox)) {
    return emptyResult;
  }

  // manga-ocr via py-mekai-api server (local in dev, Railway in prod)
  if (!(await isMangaOcrAvailable())) {
    const isLocal =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    throw new Error(
      isLocal
        ? 'manga-ocr is not running. Start py-mekai-api/main.py first.'
        : 'OCR service is unreachable. Check that VITE_RAILWAY_SERVER_URL is set and Railway is running.',
    );
  }

  _ocrRunning = true;
  try {
    const base64 = cropToDataUrl(imgEl, bbox);
    const ocrText = await localMangaOcr(base64);

    if (!ocrText) {
      return emptyResult;
    }

    let translated = '';
    let translationProvider: OcrTranslateResult['translationProvider'] = 'py-mekai-api';
    try {
      const result = await translateJapaneseToEnglishWithProvider(ocrText);
      translated = result.translated;
      translationProvider = result.provider;
    } catch (err) {
      // Translation failed — fall back to showing the Japanese OCR text so
      // the overlay is never blank (important for a live demo / offline use).
      translated = ocrText;
      console.warn('[mekai] Translation failed, showing OCR text instead:', err);
    }

    const romaji = toRomaji(ocrText);

    return { ocrText, translated, romaji, ocrSource, translationProvider };
  } finally {
    _ocrRunning = false;
    _lastOcrFinished = Date.now();
  }
}
