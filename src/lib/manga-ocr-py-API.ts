/**
 * Configuration and helpers for the py-mekai-api companion server.
 *
 * The Python server (see `py-mekai-api/`) provides:
 *   - **manga-ocr**  — state-of-the-art Japanese manga OCR
 *   - **OPUS-MT**    — high-quality offline ja→en neural translation
 *
 * In development the server runs on localhost:5100 (`VITE_LOCAL_API_URL`).
 * In production it is hosted on Railway (`VITE_OCR_API_URL`).
 *
 * The code probes the local server first; if unavailable it falls back
 * to the Railway production URL.  Both OCR and translation **require**
 * at least one of these servers — there are no browser-side fallbacks.
 */

// ─── Configuration ────────────────────────────────────────────

/**
 * Local dev URL of the py-mekai-api server (default: http://localhost:5100).
 * Set `VITE_LOCAL_API_URL` in `.env` / `.env.local` for local development.
 */
const LOCAL_API_URL: string =
  (import.meta.env.VITE_LOCAL_API_URL as string | undefined) ??
  'http://localhost:5100';

/**
 * Production Railway URL of the py-mekai-api server.
 * Set `VITE_OCR_API_URL` in `.env` or Vercel env vars for production.
 */
const RAILWAY_API_URL: string | undefined =
  (import.meta.env.VITE_OCR_API_URL as string | undefined);

/**
 * Resolved API base URL — determined at runtime by probing local first,
 * then falling back to Railway.
 */
let _resolvedUrl: string | null = null;

/** How long (ms) to wait when probing whether a local service is up. */
const PROBE_TIMEOUT_MS = 1_500;

// ─── Probing ──────────────────────────────────────────────────

/** Cache for service availability so we don't probe on every call. */
const _cache: Record<string, { available: boolean; ts: number }> = {};
/** Cache TTL — re-probe every 30 s. */
const CACHE_TTL_MS = 30_000;

/**
 * Resolve which API base URL to use.  Tries local first (fast for dev),
 * then falls back to the Railway production URL.
 */
async function resolveApiUrl(): Promise<string> {
  if (_resolvedUrl) return _resolvedUrl;

  // Try local dev server first
  if (await _probe(LOCAL_API_URL)) {
    _resolvedUrl = LOCAL_API_URL;
    return _resolvedUrl;
  }

  // Fall back to Railway production URL
  if (RAILWAY_API_URL && (await _probe(RAILWAY_API_URL))) {
    _resolvedUrl = RAILWAY_API_URL;
    return _resolvedUrl;
  }

  // Default to Railway URL even if probe failed (may come up later)
  _resolvedUrl = RAILWAY_API_URL ?? LOCAL_API_URL;
  return _resolvedUrl;
}

/** Quick root-level probe (`GET /`) to see if a server is reachable. */
async function _probe(baseUrl: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
    const res = await fetch(`${baseUrl}/`, { method: 'GET', signal: ctrl.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Check whether a py-mekai-api endpoint responds within PROBE_TIMEOUT_MS.
 * Result is cached for 30 s.
 */
async function isServiceAvailable(path: string): Promise<boolean> {
  const base = await resolveApiUrl();
  const url = `${base}${path}`;
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

/** Force re-resolve on next call (e.g. if local server was started late). */
export function resetApiUrlCache(): void {
  _resolvedUrl = null;
  for (const key of Object.keys(_cache)) delete _cache[key];
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
  const base = await resolveApiUrl();
  const res = await fetch(`${base}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  });
  if (!res.ok) throw new Error(`OCR server error: ${res.status}`);
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
  const base = await resolveApiUrl();
  const res = await fetch(`${base}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'ja', target: 'en' }),
  });
  if (!res.ok) throw new Error(`Translate server error: ${res.status}`);
  const json = (await res.json()) as { translatedText: string };
  return (json.translatedText ?? '').trim();
}
