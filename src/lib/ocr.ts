/**
 * Browser-side OCR utility using Tesseract.js.
 * Crops a normalised bounding-box region from an HTMLImageElement,
 * upscales it 2× for better recognition accuracy, rotates tall
 * (vertical-text) regions 90° CW, and returns the cleaned OCR text.
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
const VERTICAL_RATIO = 1.2;

/** Tesseract PSM type (avoids eager import of the full module). */
type PSM = import('tesseract.js').PSM;

// ─── Helpers ─────────────────────────────────────────────────

/** Padding fraction (~8%) added around the bounding box to avoid tight crops. */
const CROP_PADDING = 0.15;

/**
 * Crops a region from an HTMLImageElement into an offscreen canvas,
 * upscaling by UPSCALE for better Tesseract accuracy.
 * Adds ~8% padding around the bbox to avoid cutting into speech bubbles.
 * If the region is taller than wide (vertical text), the canvas is
 * rotated 90° clockwise so Tesseract treats it as horizontal text.
 */
function cropToCanvas(imgEl: HTMLImageElement, bbox: BBox): HTMLCanvasElement {
  const { naturalWidth: nw, naturalHeight: nh } = imgEl;

  // Apply ~8% padding around the bounding box (Task 5)
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

  const isVertical = cropH > cropW * VERTICAL_RATIO;

  const scaledW = cropW * UPSCALE;
  const scaledH = cropH * UPSCALE;

  const canvas = document.createElement('canvas');

  if (isVertical) {
    // After 90° CW rotation the dimensions swap
    canvas.width = scaledH;
    canvas.height = scaledW;
  } else {
    canvas.width = scaledW;
    canvas.height = scaledH;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context for OCR crop.');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (isVertical) {
    // Rotate 90° CW: translate to new origin, rotate, then draw
    ctx.translate(canvas.width, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(
      imgEl,
      cropX, cropY, cropW, cropH,
      0, 0, scaledW, scaledH,
    );
  } else {
    ctx.drawImage(
      imgEl,
      cropX, cropY, cropW, cropH,
      0, 0, scaledW, scaledH,
    );
  }

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
  const ctx = canvas.getContext('2d');
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
 * After binarisation, scan the canvas for dark (ink) pixels and return a
 * new canvas tightly cropped to their bounding box plus `PAD` pixels of
 * margin on every side.
 *
 * Falls back to the original canvas when:
 *   - no dark pixels are found, or
 *   - the ink area is less than 0.5% of total pixels (likely noise / no text).
 *
 * The input canvas must already be binarised (black ink on white background)
 * as produced by `preprocessCanvasForManga`.
 */
function tightenToInk(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const { width: w, height: h } = canvas;
  const { data: d } = ctx.getImageData(0, 0, w, h);

  // Scan for the bounding box of ink pixels (R channel === 0 after binarisation)
  let minX = w, minY = h, maxX = -1, maxY = -1;
  let inkCount = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = d[(y * w + x) * 4]; // R channel ─ 0=black(ink), 255=white
      if (r < 128) {
        inkCount++;
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // Fallback: no ink or ink area too small (< 0.5% of pixels → noise)
  const inkRatio = inkCount / (w * h);
  if (maxX < 0 || inkRatio < 0.005) return canvas;

  const PAD = 10; // px of margin around detected ink bbox
  const x0 = Math.max(minX - PAD, 0);
  const y0 = Math.max(minY - PAD, 0);
  const x1 = Math.min(maxX + PAD, w - 1);
  const y1 = Math.min(maxY + PAD, h - 1);
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

/** Collapse runs of whitespace and trim the string. */
function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

// ─── Public helpers ──────────────────────────────────────────

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
  const tightCanvas = tightenToInk(canvas);

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
