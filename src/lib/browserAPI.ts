// src/lib/aiPipeline.ts
import { type BBox, cropToDataUrl, hasInkContent } from '@/lib/ocr';
import { translateJapaneseToEnglishWithProvider } from '@/lib/translate';
import { toRomaji } from '@/lib/romaji';
import { isMangaOcrAvailable, localMangaOcr } from '@/lib/manga-ocr-py-API';
import type { TranslationProvider } from '@/lib/translate';

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

  // Pre-flight: skip OCR entirely if region has no detectable ink
  if (!hasInkContent(imgEl, bbox)) {
    return { ocrText: '', translated: '', romaji: null, ocrSource, translationProvider: 'py-mekai-api' };
  }

  // manga-ocr via local py-mekai-api server
  if (!(await isMangaOcrAvailable())) {
    throw new Error(
      'manga-ocr is not running. Start py-mekai-api/main.py first.',
    );
  }
  const base64 = cropToDataUrl(imgEl, bbox);
  const ocrText = await localMangaOcr(base64);

  if (!ocrText) {
    return { ocrText: '', translated: '', romaji: null, ocrSource, translationProvider: 'py-mekai-api' };
  }

  let translated = '';
  let translationProvider: OcrTranslateResult['translationProvider'] = 'py-mekai-api';
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
