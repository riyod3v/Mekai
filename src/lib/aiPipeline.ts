// src/lib/aiPipeline.ts
import { ocrFromImageElement, type BBox } from '@/lib/ocr';
import { translateJapaneseToEnglish } from '@/lib/translate';
import { toRomaji } from '@/lib/romaji';

// ─── Public types ─────────────────────────────────────────────

export type OcrTranslateResult = {
  ocrText: string;
  translated: string;
  romaji: string | null;
  source?: 'tesseract';
};

// ─── Public API ───────────────────────────────────────────────

/**
 * Run OCR on a selected region of a manga page using local Tesseract.js,
 * then translate the result with MyMemory and convert to Romaji.
 *
 * @param imgEl - The fully-loaded source HTMLImageElement.
 * @param bbox  - Normalised bounding box { x, y, w, h } (0..1).
 * @returns     OCR text, English translation, and Romaji.
 */
export async function ocrAndTranslate(
  imgEl: HTMLImageElement,
  bbox: BBox,
): Promise<OcrTranslateResult> {
  const raw = await ocrFromImageElement(imgEl, bbox, 'jpn');
  const ocrText = raw.trim();

  if (!ocrText) {
    return { ocrText: '', translated: '', romaji: null, source: 'tesseract' };
  }

  let translated = '';
  try {
    translated = await translateJapaneseToEnglish(ocrText);
  } catch {
    // Translation is best-effort; surface OCR text even if translation fails
  }

  const romaji = toRomaji(ocrText);

  return { ocrText, translated, romaji, source: 'tesseract' };
}

