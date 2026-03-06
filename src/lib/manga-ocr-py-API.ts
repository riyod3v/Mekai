/**
 * Configuration and helpers for the py-mekai-api companion server.
 *
 * The Python server (see `py-mekai-api/`) provides:
 *   - **manga-ocr**  — state-of-the-art Japanese manga OCR
 *   - **OPUS-MT**    — high-quality offline ja→en neural translation
 *
 * In development the server runs on localhost:5100.
 * In production it is hosted externally (e.g. Railway) and the URL
 * is supplied via the `VITE_MEKAI_API_URL` environment variable.
 *
 * Both OCR and translation **require** this server — there are no
 * browser-side fallbacks.
 */

// ─── Configuration ────────────────────────────────────────────

/**
 * Base URL of the py-mekai-api server.
 * Set `VITE_MEKAI_API_URL` in `.env.local` (dev) or Vercel env vars (prod).
 * Defaults to `http://localhost:5100` for local development.
 */
const MEKAI_API_URL =
  (import.meta.env.VITE_MEKAI_API_URL as string | undefined) ??
  'http://localhost:5100';

/** How long (ms) to wait when probing whether a local service is up. */
const PROBE_TIMEOUT_MS = 1_500;

// ─── Probing ──────────────────────────────────────────────────

/** Cache for service availability so we don't probe on every call. */
const _cache: Record<string, { available: boolean; ts: number }> = {};
/** Cache TTL — re-probe every 30 s. */
const CACHE_TTL_MS = 30_000;

/**
 * Check whether a py-mekai-api endpoint responds within PROBE_TIMEOUT_MS.
 * Result is cached for 30 s.
 */
async function isServiceAvailable(path: string): Promise<boolean> {
  const url = `${MEKAI_API_URL}${path}`;
  const now = Date.now();
  const cached = _cache[url];
  if (cached && now - cached.ts < CACHE_TTL_MS) return cached.available;

  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timer);
    const ok = res.ok;
    _cache[url] = { available: ok, ts: now };
    return ok;
  } catch {
    _cache[url] = { available: false, ts: now };
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
  const res = await fetch(`${MEKAI_API_URL}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  });
  if (!res.ok) throw new Error(`Local OCR server error: ${res.status}`);
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
  const res = await fetch(`${MEKAI_API_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'ja', target: 'en' }),
  });
  if (!res.ok) throw new Error(`Local translate server error: ${res.status}`);
  const json = (await res.json()) as { translatedText: string };
  return (json.translatedText ?? '').trim();
}
