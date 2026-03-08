/**
 * Configuration and helpers for the py-mekai-api companion server.
 *
 * The Python server (see `py-mekai-api/`) provides:
 *   - **manga-ocr**  — state-of-the-art Japanese manga OCR
 *   - **OPUS-MT**    — high-quality offline ja→en neural translation
 *
 * URL selection is based on the current hostname at runtime:
 *   - localhost / 127.0.0.1  → VITE_LOCAL_API_URL (default: http://localhost:5100)
 *   - any other hostname     → VITE_OCR_API_URL   (Railway production)
 *
 * This avoids probing localhost in production, which browsers block via CORS
 * before any fallback logic can execute.
 */

// ─── Configuration ────────────────────────────────────────────

const _isLocal =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' ||
    window.location.hostname === '127.0.0.1');

/**
 * Resolved API base URL — localhost in dev, Railway in production.
 * Selected synchronously at module load time based on hostname.
 */
const BASE_API_URL: string = _isLocal
  ? ((import.meta.env.VITE_LOCAL_API_URL as string | undefined) ?? 'http://localhost:5100')
  : ((import.meta.env.VITE_OCR_API_URL as string | undefined) ?? '');
console.log("Resolved OCR API:", BASE_API_URL);
/** How long (ms) to wait for a health probe before treating it as unavailable. */
const PROBE_TIMEOUT_MS = 3_000;

// ─── Health check ─────────────────────────────────────────────

/**
 * Check whether a py-mekai-api endpoint responds within PROBE_TIMEOUT_MS.
 */
async function isServiceAvailable(path: string): Promise<boolean> {
  if (!BASE_API_URL) return false;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${BASE_API_URL}${path}`, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Manga-OCR ───────────────────────────────────────────────

/**
 * Returns `true` when the manga-ocr endpoint is reachable.
 */
export async function isMangaOcrAvailable(): Promise<boolean> {
  return isServiceAvailable('/ocr/health');
}

/**
 * Send an image region to the manga-ocr endpoint and return
 * the recognised Japanese text.
 *
 * @param imageBase64 - Base-64 encoded PNG/JPEG of the cropped region.
 */
export async function localMangaOcr(imageBase64: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${BASE_API_URL}/ocr`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image: imageBase64 }),
    });
  } catch (err) {
    // Network / CORS / DNS failure — the backend is likely down
    throw new Error(
      `Cannot reach OCR server at ${BASE_API_URL}. ` +
      `The server may be starting up or temporarily unavailable. Please try again in a moment.`
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`OCR server error: ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  const json = (await res.json()) as { text: string };
  return (json.text ?? '').trim();
}

// ─── Translation (OPUS-MT) ───────────────────────────────────

/**
 * Returns `true` when the translate endpoint is reachable
 * (i.e. `GET /translate/health` returns HTTP 200).
 */
export async function isLocalTranslateAvailable(): Promise<boolean> {
  return isServiceAvailable('/translate/health');
}

/**
 * Translate Japanese → English via the py-mekai-api server (OPUS-MT).
 */
export async function localTranslateJaToEn(text: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(`${BASE_API_URL}/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, source: 'ja', target: 'en' }),
    });
  } catch (err) {
    throw new Error(
      `Cannot reach translation server at ${BASE_API_URL}. ` +
      `The server may be starting up or temporarily unavailable. Please try again in a moment.`
    );
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Translate server error: ${res.status}${detail ? ` — ${detail}` : ''}`);
  }
  const json = (await res.json()) as { translatedText: string };
  return (json.translatedText ?? '').trim();
}
