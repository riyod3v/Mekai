/**
 * Multi-provider Japanese → English translation.
 *
 * Provider priority (first available wins):
 *   1. Local translate service (via local-services companion server)
 *   2. MyMemory free API  (no key required, works everywhere)
 *
 * When running on Vercel the local service is unreachable so MyMemory
 * is used automatically. During a local demo you can start the companion
 * server (`local-services/`) to get higher quality offline translations.
 */

import {
  isLocalTranslateAvailable,
  localTranslateJaToEn,
} from '@/lib/localServices';

// ─── Public types ───────────────────────────────────────────

/** Which translation provider produced the result. */
export type TranslationProvider = 'local-services' | 'MyMemory';

// ─── MyMemory (free, no key) ────────────────────────────────

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

/** Maximum characters MyMemory handles reliably per request. */
const MAX_CHARS = 500;

interface MyMemoryResponse {
  responseData: {
    translatedText: string;
  };
  responseStatus: number;
}

async function translateWithMyMemory(text: string): Promise<string> {
  const query = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(query)}&langpair=ja|en`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`MyMemory HTTP ${res.status}`);
  const json = (await res.json()) as MyMemoryResponse;

  const translated = json?.responseData?.translatedText?.trim();
  if (!translated) throw new Error('MyMemory returned empty result');

  return translated.replace(/\s+/g, ' ');
}

// ─── Public API ─────────────────────────────────────────────

/**
 * Translate a Japanese string to English, returning both the translated
 * text and which provider was used.
 *
 * - Empty / whitespace-only input → returns immediately with provider 'MyMemory'.
 * - Tries local translate service first (if running).
 * - Falls back to MyMemory.
 * - Throws if ALL providers fail.
 */
export async function translateJapaneseToEnglishWithProvider(
  text: string,
): Promise<{ translated: string; provider: TranslationProvider }> {
  const trimmed = text.trim();
  if (!trimmed) return { translated: '', provider: 'MyMemory' };

  // 1️⃣ Try local translate service (best quality, offline)
  try {
    if (await isLocalTranslateAvailable()) {
      const translated = await localTranslateJaToEn(trimmed);
      return { translated, provider: 'local-services' };
    }
  } catch {
    // Fall through to next provider
  }

  // 2️⃣ MyMemory (always-available free API)
  try {
    const translated = await translateWithMyMemory(trimmed);
    return { translated, provider: 'MyMemory' };
  } catch {
    throw new Error('Translation failed');
  }
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
