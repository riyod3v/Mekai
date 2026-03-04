// src/lib/aiPipeline.ts
import { ocrFromImageElement, type BBox, cropToDataUrl, hasInkContent } from '@/lib/ocr';
import { translateJapaneseToEnglishWithProvider } from '@/lib/translate';
import { toRomaji } from '@/lib/romaji';
import { isMangaOcrAvailable, localMangaOcr } from '@/lib/localServices';
import type { TranslationProvider } from '@/lib/translate';

// ─── Public types ─────────────────────────────────────────────

export type OcrTranslateResult = {
  ocrText: string;
  translated: string;
  romaji: string | null;
  /** Which OCR engine produced the text. */
  ocrSource: 'manga-ocr' | 'tesseract';
  /** Which translation provider produced the translation. */
  translationProvider: TranslationProvider;
};

// ─── Public API ───────────────────────────────────────────────

/**
 * Run OCR on a selected region of a manga page, then translate and
 * convert to Romaji.
 *
 * OCR provider priority:
 *   1. Local **manga-ocr** server (much better for manga Japanese)
 *   2. Browser **Tesseract.js** (always available)
 *
 * Translation provider priority is handled inside `translateJapaneseToEnglish`.
 *
 * @param imgEl - The fully-loaded source HTMLImageElement.
 * @param bbox  - Normalised bounding box { x, y, w, h } (0..1).
 * @returns     OCR text, English translation, and Romaji.
 */
export async function ocrAndTranslate(
  imgEl: HTMLImageElement,
  bbox: BBox,
): Promise<OcrTranslateResult> {
  let ocrText = '';
  let ocrSource: OcrTranslateResult['ocrSource'] = 'tesseract';

  // 0️⃣  Pre-flight: skip OCR entirely if region has no detectable ink
  if (!hasInkContent(imgEl, bbox)) {
    return { ocrText: '', translated: '', romaji: null, ocrSource, translationProvider: 'MyMemory' };
  }

  // 1️⃣  Try local manga-ocr (higher quality for manga)
  try {
    if (await isMangaOcrAvailable()) {
      const base64 = cropToDataUrl(imgEl, bbox);
      ocrText = await localMangaOcr(base64);
      ocrSource = 'manga-ocr';
    }
  } catch {
    // Fall through to Tesseract
    ocrText = '';
  }

  // 2️⃣  Fall back to browser Tesseract.js
  if (!ocrText) {
    const raw = await ocrFromImageElement(imgEl, bbox, 'jpn');
    ocrText = raw.trim();
    ocrSource = 'tesseract';
  }

  if (!ocrText) {
    return { ocrText: '', translated: '', romaji: null, ocrSource, translationProvider: 'MyMemory' };
  }

  let translated = '';
  let translationProvider: OcrTranslateResult['translationProvider'] = 'MyMemory';
  try {
    const result = await translateJapaneseToEnglishWithProvider(ocrText);
    translated = result.translated;
    translationProvider = result.provider;
  } catch {
    // Translation is best-effort; surface OCR text even if translation fails
  }

  const romaji = toRomaji(ocrText);

  return { ocrText, translated, romaji, ocrSource, translationProvider };
}
