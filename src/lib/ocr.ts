/**
 * Browser-side OCR utility using Tesseract.js.
 * Crops a normalised bounding-box region from an HTMLImageElement,
 * upscales it 2× for better recognition accuracy, then returns
 * the cleaned OCR text.
 */

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
const UPSCALE = 2;

/** Default Tesseract language. Override per call if needed. */
const DEFAULT_LANG = 'jpn';

// ─── Helpers ─────────────────────────────────────────────────

/**
 * Crops a region from an HTMLImageElement into an offscreen canvas,
 * upscaling by UPSCALE for better Tesseract accuracy.
 */
function cropToCanvas(imgEl: HTMLImageElement, bbox: BBox): HTMLCanvasElement {
  const { naturalWidth: nw, naturalHeight: nh } = imgEl;

  const cropX = Math.round(bbox.x * nw);
  const cropY = Math.round(bbox.y * nh);
  const cropW = Math.max(Math.round(bbox.w * nw), 1);
  const cropH = Math.max(Math.round(bbox.h * nh), 1);

  const canvas = document.createElement('canvas');
  canvas.width = cropW * UPSCALE;
  canvas.height = cropH * UPSCALE;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context for OCR crop.');

  // Scale up while drawing so Tesseract gets a larger, cleaner image
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    imgEl,
    cropX, cropY, cropW, cropH,      // source rect (natural px)
    0, 0, canvas.width, canvas.height // dest rect (upscaled)
  );

  return canvas;
}

/** Collapse runs of whitespace and trim the string. */
function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

// ─── Public API ───────────────────────────────────────────────

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

  const worker = await createWorker(lang, 1, {
    // Suppress internal Tesseract console noise
    logger: () => {},
  });

  try {
    const {
      data: { text },
    } = await worker.recognize(canvas);
    return cleanText(text);
  } finally {
    // Always release the worker, even if OCR throws
    await worker.terminate();
  }
}
