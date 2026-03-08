/**
 * Japanese → English translation via the py-mekai-api companion server.
 *
 * The local Python server (see `py-mekai-api/`) must be running.
 * Throws if the service is unavailable or returns an error.
 */

import {
  isLocalTranslateAvailable,
  localTranslateJaToEn,
} from '@/lib/api/manga-ocr-py-API';

// ─── Public types ───────────────────────────────────────────

/** Which translation provider produced the result. */
export type TranslationProvider = 'py-mekai-api';

// ─── Public API ─────────────────────────────────────────────

/**
 * Translate a Japanese string to English via the local py-mekai-api server,
 * returning both the translated text and the provider name.
 *
 * - Empty / whitespace-only input → returns immediately.
 * - Throws if the local service is unavailable or translation fails.
 */
export async function translateJapaneseToEnglishWithProvider(
  text: string,
): Promise<{ translated: string; provider: TranslationProvider }> {
  const trimmed = text.trim();
  if (!trimmed) return { translated: '', provider: 'py-mekai-api' };

  if (!(await isLocalTranslateAvailable())) {
    throw new Error(
      'Local translate service is not running. Start py-mekai-api/main.py first.',
    );
  }

  const translated = await localTranslateJaToEn(trimmed);
  return { translated, provider: 'py-mekai-api' };
}

/**
 * Convenience wrapper — returns only the translated string.
 * Use `translateJapaneseToEnglishWithProvider` when you also need the
 * provider label (e.g. for debug display).
 */
export async function translateJapaneseToEnglish(text: string): Promise<string> {
  const { translated } = await translateJapaneseToEnglishWithProvider(text);
  return translated;
}
