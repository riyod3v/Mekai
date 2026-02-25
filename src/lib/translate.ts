// ─── Translation (MyMemory free API) ────────────────────────

const MYMEMORY_URL = 'https://api.mymemory.translated.net/get';

/** Maximum characters MyMemory handles reliably per request. */
const MAX_CHARS = 500;

interface MyMemoryResponse {
  responseData: {
    translatedText: string;
  };
  responseStatus: number;
}

/**
 * Translate a Japanese string to English using the free MyMemory API.
 *
 * - Empty / whitespace-only input → returns empty string immediately.
 * - Input longer than 500 chars is sliced before sending.
 * - Network / parse errors → throws Error("Translation failed").
 */
export async function translateJapaneseToEnglish(text: string): Promise<string> {
  const trimmed = text.trim();
  if (!trimmed) return '';

  // Slice to keep within MyMemory's reliable range
  const query = trimmed.length > MAX_CHARS ? trimmed.slice(0, MAX_CHARS) : trimmed;

  const url = `${MYMEMORY_URL}?q=${encodeURIComponent(query)}&langpair=ja|en`;

  let json: MyMemoryResponse;
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    json = await res.json() as MyMemoryResponse;
  } catch {
    throw new Error('Translation failed');
  }

  const translated = json?.responseData?.translatedText?.trim();
  if (!translated) throw new Error('Translation failed');

  // Collapse any extra whitespace introduced by the API
  return translated.replace(/\s+/g, ' ');
}
