import { supabase } from '@/lib/supabase';
import type { TranslationHistory, RegionBox } from '@/types';

// ─── OCR ─────────────────────────────────────────────────────

/**
 * Runs OCR on a cropped region of an HTMLImageElement using Tesseract.js.
 * Returns the recognized text.
 */
export async function runOcrOnRegion(
  imageEl: HTMLImageElement,
  region: RegionBox,
  language = 'jpn'
): Promise<string> {
  // Dynamic import so Tesseract only loads when needed
  const { createWorker } = await import('tesseract.js');

  // Crop the region into an offscreen canvas
  const canvas = document.createElement('canvas');
  const naturalW = imageEl.naturalWidth;
  const naturalH = imageEl.naturalHeight;

  const cropX = Math.floor(region.x * naturalW);
  const cropY = Math.floor(region.y * naturalH);
  const cropW = Math.max(Math.floor(region.w * naturalW), 1);
  const cropH = Math.max(Math.floor(region.h * naturalH), 1);

  canvas.width = cropW;
  canvas.height = cropH;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(imageEl, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

  const worker = await createWorker(language, 1, {
    // Silence Tesseract console noise in production
    logger: () => {},
  });

  const { data } = await worker.recognize(canvas);
  await worker.terminate();
  return data.text.trim();
}

// ─── Placeholder Translation ──────────────────────────────────

/**
 * Placeholder translation function.
 *
 * To use a real API (e.g. DeepL, Google Translate, LibreTranslate):
 * 1. Add VITE_TRANSLATE_API_KEY and VITE_TRANSLATE_API_URL to .env.local
 * 2. Replace this implementation with the actual API call.
 *
 * This placeholder reverses word order so you can see it's "working"
 * without an API key.
 */
export async function translateText(
  text: string,
  _targetLang = 'en'
): Promise<{ translated: string; romaji: string | null }> {
  const apiUrl = import.meta.env.VITE_TRANSLATE_API_URL as string | undefined;
  const apiKey = import.meta.env.VITE_TRANSLATE_API_KEY as string | undefined;

  if (apiUrl && apiKey) {
    try {
      // Example: LibreTranslate compatible API
      const res = await fetch(`${apiUrl}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          q: text,
          source: 'ja',
          target: _targetLang,
          api_key: apiKey,
        }),
      });
      if (res.ok) {
        const json = await res.json() as { translatedText?: string };
        return { translated: json.translatedText ?? text, romaji: null };
      }
    } catch {
      // Fall through to placeholder
    }
  }

  // Placeholder: tag the text so users know it's un-translated
  return {
    translated: `[Placeholder] ${text}`,
    romaji: null,
  };
}

// ─── Translation History DB ───────────────────────────────────

export async function fetchTranslationHistory(
  pageId: string,
  userId: string
): Promise<TranslationHistory[]> {
  const { data, error } = await supabase
    .from('translation_history')
    .select('*')
    .eq('page_id', pageId)
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data as TranslationHistory[];
}

export async function saveTranslationHistory(entry: {
  userId: string;
  pageId: string;
  region: RegionBox;
  ocrText: string;
  translated: string | null;
  romaji: string | null;
}): Promise<TranslationHistory> {
  const { data, error } = await supabase
    .from('translation_history')
    .insert({
      user_id: entry.userId,
      page_id: entry.pageId,
      region_x: entry.region.x,
      region_y: entry.region.y,
      region_w: entry.region.w,
      region_h: entry.region.h,
      ocr_text: entry.ocrText,
      translated: entry.translated,
      romaji: entry.romaji,
      visible: true,
    })
    .select()
    .single();
  if (error) throw error;
  return data as TranslationHistory;
}

export async function toggleTranslationHistoryVisibility(
  id: string,
  visible: boolean
): Promise<void> {
  const { error } = await supabase
    .from('translation_history')
    .update({ visible })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteTranslationHistoryEntry(id: string): Promise<void> {
  const { error } = await supabase
    .from('translation_history')
    .delete()
    .eq('id', id);
  if (error) throw error;
}
