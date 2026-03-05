/**
 * Configuration and helpers for optional local services used during
 * development or live demos.
 *
 * When running locally you can spin up a Python companion server
 * (see `py-mekai-api/README.md`) that provides:
 *   - manga-ocr   → vastly better Japanese OCR than browser Tesseract
 *   - Local translate → offline, higher quality ja→en translation
 *
 * The React app auto-detects these services and upgrades transparently.
 * When deployed to Vercel the local endpoints are unreachable so the
 * app falls back to the browser-based pipeline (Tesseract + MyMemory).
 */

// ─── Configuration ────────────────────────────────────────────

/** Base URL of the local companion server. */
const LOCAL_SERVER_URL =
  (import.meta.env.VITE_LOCAL_SERVER_URL as string | undefined) ??
  'http://localhost:5100';

/** How long (ms) to wait when probing whether a local service is up. */
const PROBE_TIMEOUT_MS = 1_500;

// ─── Probing ──────────────────────────────────────────────────

/** Cache for service availability so we don't probe on every call. */
const _cache: Record<string, { available: boolean; ts: number }> = {};
/** Cache TTL — re-probe every 30 s. */
const CACHE_TTL_MS = 30_000;

/**
 * Check whether a local HTTP endpoint responds within PROBE_TIMEOUT_MS.
 * Result is cached for 30 s.
 */
async function isLocalServiceAvailable(path: string): Promise<boolean> {
  const url = `${LOCAL_SERVER_URL}${path}`;
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

// ─── Manga-OCR (local) ───────────────────────────────────────

/**
 * Returns `true` when the local manga-ocr server is reachable.
 */
export async function isMangaOcrAvailable(): Promise<boolean> {
  return isLocalServiceAvailable('/ocr/health');
}

/**
 * Send an image region to the local manga-ocr server and return
 * the recognised Japanese text.
 *
 * @param imageBase64 - Base-64 encoded PNG/JPEG of the cropped region.
 */
export async function localMangaOcr(imageBase64: string): Promise<string> {
  const res = await fetch(`${LOCAL_SERVER_URL}/ocr`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  });
  if (!res.ok) throw new Error(`Local OCR server error: ${res.status}`);
  const json = (await res.json()) as { text: string };
  return (json.text ?? '').trim();
}

// ─── Translation (local) ─────────────────────────────────────

/**
 * Returns `true` when the local translate service is reachable
 * (i.e. `GET /translate/health` returns HTTP 200).
 */
export async function isLocalTranslateAvailable(): Promise<boolean> {
  return isLocalServiceAvailable('/translate/health');
}

/**
 * Translate Japanese → English via the local companion server.
 */
export async function localTranslateJaToEn(text: string): Promise<string> {
  const res = await fetch(`${LOCAL_SERVER_URL}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: text, source: 'ja', target: 'en' }),
  });
  if (!res.ok) throw new Error(`Local translate server error: ${res.status}`);
  const json = (await res.json()) as { translatedText: string };
  return (json.translatedText ?? '').trim();
}
