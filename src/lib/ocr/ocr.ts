/**
 * Browser-side OCR utility using Tesseract.js.
 *
 * Pipeline: cropToCanvas → preprocessCanvasForManga (Otsu binarization)
 *         → tightenToInk → rotateIfVertical → Tesseract recognize.
 *
 * Vertical-text rotation is applied *after* ink-tightening so the
 * aspect-ratio check reflects the actual text block, not the user's
 * raw selection which may include surrounding whitespace.
 */

// ─── Debug flag ───────────────────────────────────────────────
/** Set to `true` to enable verbose OCR logging in the browser console. */
const DEBUG_OCR = false;

// ─── Types ────────────────────────────────────────────────────

/** Normalised bounding box — all values are fractions of image dimensions (0..1). */
export type BBox = {
  x: number;
  y: number;
  w: number;
  h: number;
};

// ─── Constants ────────────────────────────────────────────────

/** Upscale factor applied to the cropped region before OCR. */
const UPSCALE = 3;

/** Default Tesseract language. Override per call if needed. */
const DEFAULT_LANG = 'jpn';

/** Threshold: if height > width * this factor, assume vertical text. */
const VERTICAL_RATIO = 1.3;

/** Tesseract PSM type (avoids eager import of the full module). */
type PSM = import('tesseract.js').PSM;

// ─── Helpers ─────────────────────────────────────────────────

/** Padding fraction (~8%) added around the bounding box to avoid tight crops. */
const CROP_PADDING = 0.15;

/**
 * Crops a region from an HTMLImageElement into an offscreen canvas,
 * upscaling by UPSCALE for better Tesseract accuracy.
 * Adds padding around the bbox to avoid cutting into speech bubbles.
 *
 * Note: vertical-text rotation is handled separately by `rotateIfVertical`
 * which runs after ink-tightening for a more accurate aspect-ratio check.
 */
function cropToCanvas(imgEl: HTMLImageElement, bbox: BBox): HTMLCanvasElement {
  const { naturalWidth: nw, naturalHeight: nh } = imgEl;

  // Apply padding around the bounding box
  const padW = bbox.w * CROP_PADDING;
  const padH = bbox.h * CROP_PADDING;
  const padX = Math.max(bbox.x - padW, 0);
  const padY = Math.max(bbox.y - padH, 0);
  const padRight = Math.min(bbox.x + bbox.w + padW, 1);
  const padBottom = Math.min(bbox.y + bbox.h + padH, 1);

  const cropX = Math.round(padX * nw);
  const cropY = Math.round(padY * nh);
  const cropW = Math.max(Math.round((padRight - padX) * nw), 1);
  const cropH = Math.max(Math.round((padBottom - padY) * nh), 1);

  const scaledW = cropW * UPSCALE;
  const scaledH = cropH * UPSCALE;

  const canvas = document.createElement('canvas');
  canvas.width = scaledW;
  canvas.height = scaledH;

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) throw new Error('Could not get 2D canvas context for OCR crop.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(
    imgEl,
    cropX, cropY, cropW, cropH,
    0, 0, scaledW, scaledH,
  );

  return canvas;
}

/**
 * Binarise a canvas in-place for optimal Tesseract accuracy on manga crops.
 *
 * Steps:
 *   1. Convert to grayscale and build a luminance histogram.
 *   2. Apply Otsu's method to find the optimal binarisation threshold.
 *   3. Auto-detect dark-background panels (dark ratio > 55%) and invert.
 *   4. Write back pure black (0) / white (255) pixels — Tesseract's ideal input.
 *
 * Operates entirely in canvas pixel space; does not affect the external
 * `cropToDataUrl` path used by manga-ocr (which benefits from the same cleanup).
 */
function preprocessCanvasForManga(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return;

  const { width: w, height: h } = canvas;
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;

  // 1) Grayscale + gather histogram
  const hist = new Array<number>(256).fill(0);
  const gray = new Uint8Array(w * h);

  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const g = Math.round(d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114);
    gray[p] = g;
    hist[g]++;
  }

  // 2) Otsu threshold (fast enough for small crops)
  const total = w * h;
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let varMax = 0;
  let threshold = 160; // fallback

  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    wF = total - wB;
    if (wF === 0) break;

    sumB += t * hist[t];

    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;

    const varBetween = wB * wF * (mB - mF) * (mB - mF);
    if (varBetween > varMax) {
      varMax = varBetween;
      threshold = t;
    }
  }

  // 3) Decide if we should invert (dark background case)
  let darkCount = 0;
  for (let p = 0; p < gray.length; p++) {
    if (gray[p] < threshold) darkCount++;
  }
  const darkRatio = darkCount / gray.length;
  const invert = darkRatio > 0.55; // if mostly dark, invert so text stays black

  // 4) Apply binarization (+ optional inversion)
  for (let i = 0, p = 0; i < d.length; i += 4, p++) {
    const isDark = gray[p] < threshold;
    const bit = invert ? !isDark : isDark;
    const v = bit ? 0 : 255; // black ink on white background
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }

  ctx.putImageData(img, 0, 0);
}

/**
 * Lightweight iterative (stack-based) 4-connected flood-fill labeller.
 *
 * Input: a binary `mask` (Uint8Array, 1 = ink pixel, 0 = background) with
 * dimensions `w` × `h`.
 *
 * Output:
 *   labels — Int32Array where each ink pixel holds its component id (≥ 1);
 *            background pixels stay 0.
 *   sizes  — Map from component id → pixel count.
 *
 * Uses an explicit stack instead of recursion to avoid call-stack overflow on
 * large crops.  Time/space complexity is O(w × h).
 */
function labelComponents(
  mask: Uint8Array,
  w: number,
  h: number,
): { labels: Int32Array; sizes: Map<number, number> } {
  const labels = new Int32Array(w * h);
  const sizes  = new Map<number, number>();
  let nextLabel = 1;
  const stack: number[] = [];

  for (let start = 0; start < w * h; start++) {
    if (mask[start] === 0 || labels[start] !== 0) continue;

    const id = nextLabel++;
    sizes.set(id, 0);
    stack.push(start);
    labels[start] = id;

    while (stack.length > 0) {
      const idx = stack.pop()!;
      sizes.set(id, (sizes.get(id) ?? 0) + 1);

      const x = idx % w;
      const y = (idx - x) / w;

      // 4-connected neighbours
      if (y > 0     && mask[idx - w] === 1 && labels[idx - w] === 0) { labels[idx - w] = id; stack.push(idx - w); }
      if (y < h - 1 && mask[idx + w] === 1 && labels[idx + w] === 0) { labels[idx + w] = id; stack.push(idx + w); }
      if (x > 0     && mask[idx - 1] === 1 && labels[idx - 1] === 0) { labels[idx - 1] = id; stack.push(idx - 1); }
      if (x < w - 1 && mask[idx + 1] === 1 && labels[idx + 1] === 0) { labels[idx + 1] = id; stack.push(idx + 1); }
    }
  }

  return { labels, sizes };
}

/**
 * After binarisation, scan the canvas for dark (ink) pixels and return a
 * new canvas tightly cropped to their bounding box plus padding on every side.
 *
 * Connected-component filtering (Task 7):
 *   After computing the initial ink mask, labels connected components and
 *   discards:
 *     • Tiny specks  (< MIN_COMPONENT_REL of canvas area) — noise
 *     • Large blobs  (> MAX_COMPONENT_REL of canvas area) — artwork fills
 *   The tight bbox is then computed from only the surviving text-like pixels.
 *   If filtering removes everything, falls back to the original full ink bbox.
 *
 * Falls back to the original canvas when:
 *   - no dark pixels are found, or
 *   - the ink area is less than 0.5% of total pixels (likely noise / no text).
 *
 * The input canvas must already be binarised (black ink on white background)
 * as produced by `preprocessCanvasForManga`.
 */
function tightenToInk(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return canvas;

  const { width: w, height: h } = canvas;
  const { data: d } = ctx.getImageData(0, 0, w, h);
  const total = w * h;

  // Build binary mask + initial ink bbox in one pass
  const mask = new Uint8Array(total);
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let inkCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = y * w + x;
      if (d[idx * 4] < 128) { // R channel — 0 = ink after binarisation
        mask[idx] = 1;
        inkCount++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback: no ink or ink area too small (< 0.5% of pixels → noise)
  const inkRatio = inkCount / total;
  if (maxX < 0 || inkRatio < 0.005) return canvas;

  // ── Connected-component filtering ─────────────────────────
  // Keep components whose pixel count falls between these fractions of total:
  const MIN_COMPONENT_REL = 0.0001; // 0.01% — drops isolated specks
  const MAX_COMPONENT_REL = 0.20;   // 20%   — drops large artwork fills
  const minPx = Math.max(Math.round(total * MIN_COMPONENT_REL), 5);
  const maxPx = Math.round(total * MAX_COMPONENT_REL);

  const { labels, sizes } = labelComponents(mask, w, h);

  // Determine which component ids are text-like
  const keep = new Set<number>();
  for (const [id, count] of sizes) {
    if (count >= minPx && count <= maxPx) keep.add(id);
  }

  // Recompute tight bbox from text-like pixels only
  let fMinX = w, fMinY = h, fMaxX = -1, fMaxY = -1;
  if (keep.size > 0) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (mask[idx] === 1 && keep.has(labels[idx])) {
          if (x < fMinX) fMinX = x;
          if (y < fMinY) fMinY = y;
          if (x > fMaxX) fMaxX = x;
          if (y > fMaxY) fMaxY = y;
        }
      }
    }
  }

  // If filtering removed everything, fall back to original ink bbox
  if (fMaxX < 0) {
    fMinX = minX; fMinY = minY; fMaxX = maxX; fMaxY = maxY;
  }

  // 6% proportional padding around the final ink bbox
  const padX = Math.round(w * 0.06);
  const padY = Math.round(h * 0.06);
  const x0 = Math.max(fMinX - padX, 0);
  const y0 = Math.max(fMinY - padY, 0);
  const x1 = Math.min(fMaxX + padX, w - 1);
  const y1 = Math.min(fMaxY + padY, h - 1);
  const bw = x1 - x0 + 1;
  const bh = y1 - y0 + 1;

  // No meaningful reduction — skip the extra allocation
  if (bw >= w && bh >= h) return canvas;

  const tight = document.createElement('canvas');
  tight.width = bw;
  tight.height = bh;
  const tCtx = tight.getContext('2d');
  if (!tCtx) return canvas;

  tCtx.drawImage(canvas, x0, y0, bw, bh, 0, 0, bw, bh);
  return tight;
}

/**
 * If the canvas is taller than wide (by VERTICAL_RATIO), rotate it 90° CW
 * so Tesseract treats vertical Japanese text as horizontal.
 *
 * This runs **after** ink-tightening so the aspect ratio reflects the actual
 * text block, not the user's initial selection which may include whitespace.
 */
function rotateIfVertical(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const { width: w, height: h } = canvas;
  if (h <= w * VERTICAL_RATIO) return canvas; // already landscape / square-ish

  const rotated = document.createElement('canvas');
  rotated.width = h;
  rotated.height = w;

  const ctx = rotated.getContext('2d');
  if (!ctx) return canvas;

  ctx.translate(rotated.width, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, 0, 0);

  return rotated;
}

/** Collapse runs of whitespace and trim the string. */
function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

// ─── Public helpers ──────────────────────────────────────────

/**
 * Quick pre-flight check: returns `false` when the selected region almost
 * certainly contains no Japanese text, saving the cost of running OCR on
 * artwork, textures, or blank areas.
 *
 * Reuses `cropToCanvas` + `preprocessCanvasForManga` (Otsu binarization)
 * so the threshold adapts per image; no fixed grey-level magic numbers.
 *
 * Thresholds are deliberately conservative (biased toward false-positives)
 * to avoid blocking real small-text bubbles:
 *   • inkPixelRatio  < 0.3 % → no text
 *   • tightBBoxRatio < 0.8 % of canvas area → no text
 *
 * Returns `true` on any canvas error so OCR still runs (permissive fallback).
 */
export function hasInkContent(imgEl: HTMLImageElement, bbox: BBox): boolean {
  const canvas = cropToCanvas(imgEl, bbox);
  preprocessCanvasForManga(canvas);

  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return true; // permissive on context failure

  const { width: w, height: h } = canvas;
  const { data: d } = ctx.getImageData(0, 0, w, h);
  const total = w * h;

  let minX = w, minY = h, maxX = -1, maxY = -1;
  let inkCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = d[(y * w + x) * 4]; // R channel — 0 = ink after binarisation
      if (r < 128) {
        inkCount++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (inkCount / total < 0.003) return false; // < 0.3 % ink pixels
  if (maxX < 0) return false;                  // no ink found at all

  const bboxArea = (maxX - minX + 1) * (maxY - minY + 1);
  if (bboxArea / total < 0.008) return false;  // ink bbox < 0.8 % of area

  return true;
}

/**
 * Crop a bounding-box region from an image element and return it as a
 * base-64 data URL (PNG). Used by the local manga-ocr integration.
 */
export function cropToDataUrl(imgEl: HTMLImageElement, bbox: BBox): string {
  const canvas = cropToCanvas(imgEl, bbox);
  return canvas.toDataURL('image/png');
}

// ─── Public API ───────────────────────────────────────────────

// Patch console.warn once to suppress "Parameter not found" noise from
// the Tesseract WASM build (tesseract-core-relax_*.wasm.js).
// The LSTM-only engine auto-loads legacy parameter files that reference
// options the WASM build doesn't support, producing dozens of warnings.
const _origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  if (first.includes('Parameter not found')) return;
  _origWarn.apply(console, args);
};

/**
 * Run OCR on a normalised bounding-box region of an image element.
 *
 * @param imgEl  - The source HTMLImageElement (must be fully loaded).
 * @param bbox   - Normalised region { x, y, w, h } in 0..1.
 * @param lang   - Tesseract language code (default: 'jpn').
 * @returns      Cleaned OCR text.
 * @throws       If the image is not loaded, the canvas cannot be created,
 *               or Tesseract fails.
 */
export async function ocrFromImageElement(
  imgEl: HTMLImageElement,
  bbox: BBox,
  lang = DEFAULT_LANG,
): Promise<string> {
  if (!imgEl.complete || imgEl.naturalWidth === 0) {
    throw new Error('Image element is not fully loaded. Wait for the onload event before calling ocrFromImageElement.');
  }

  // Lazy-load Tesseract so it isn't bundled in the initial chunk
  const { createWorker } = await import('tesseract.js');

  const canvas = cropToCanvas(imgEl, bbox);
  preprocessCanvasForManga(canvas);
  const tightCanvas = rotateIfVertical(tightenToInk(canvas));

  const worker = await createWorker('jpn', 1, {
    // logger must always be a function — passing undefined throws a TypeError
    logger: DEBUG_OCR
      ? (m: { status?: string; progress?: number }) => {
          // eslint-disable-next-line no-console
          console.log('[OCR]', m.status, m.progress);
        }
      : () => {}, // no-op keeps Tesseract happy while suppressing noise
  });

  try {
    // Only set parameters that the WASM / LSTM-only build actually supports.
    await worker.setParameters({
      tessedit_pageseg_mode: '6' as PSM,
    });

    const {
      data: { text },
    } = await worker.recognize(tightCanvas);

    let result = cleanText(text);
    if (DEBUG_OCR) console.log('[OCR] PSM 6 result:', result); // eslint-disable-line no-console

    // If result is too short, retry with sparse-text mode (PSM 11)
    if (result.length < 2) {
      await worker.setParameters({
        tessedit_pageseg_mode: '11' as PSM,
      });
      const {
        data: { text: retryText },
      } = await worker.recognize(tightCanvas);
      result = cleanText(retryText);
      if (DEBUG_OCR) console.log('[OCR] PSM 11 retry:', result); // eslint-disable-line no-console
    }

    return result;
  } finally {
    await worker.terminate();
  }
}

/**
 * Alias for ocrFromImageElement — canonical export name for the OCR pipeline.
 * @see ocrFromImageElement
 */
export const extractTextFromImage = ocrFromImageElement;
