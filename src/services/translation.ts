// ─── Translation ─────────────────────────────────────────────

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
