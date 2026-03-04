/**
 * Browser-side OCR utility using Tesseract.js.
 * Crops a normalised bounding-box region from an HTMLImageElement,
 * upscales it 2× for better recognition accuracy, rotates tall
 * (vertical-text) regions 90° CW, and returns the cleaned OCR text.
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

/** Threshold: if height > width * this factor, assume vertical text. */
const VERTICAL_RATIO = 1.2;

/** Tesseract PSM type (avoids eager import of the full module). */
type PSM = import('tesseract.js').PSM;

/**
 * Set of Tesseract parameters that are NOT supported by the WASM / LSTM-only
 * runtime and produce noisy console warnings. We suppress ALL of them.
 *
 * Known unsupported params (non-exhaustive):
 *   language_model_ngram_on, language_model_ngram_scale_factor,
 *   language_model_ngram_space_delimited_language,
 *   language_model_ngram_nonmatch_score,
 *   language_model_use_sigmoidal_certainty,
 *   classify_integer_matcher_multiplier, classify_cp_cutoff_strength,
 *   enable_new_segsearch, textord_force_make_prop_words,
 *   edges_max_children_per_outline, segsearch_max_char_wh_ratio,
 *   assume_fixed_pitch_char_segment, chop_enable,
 *   preserve_interword_spaces, …
 */

// ─── Helpers ─────────────────────────────────────────────────

/** Padding fraction (~8%) added around the bounding box to avoid tight crops. */
const CROP_PADDING = 0.08;

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

/** Collapse runs of whitespace and trim the string. */
function cleanText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

// ─── Public API ───────────────────────────────────────────────

// Patch console.warn once to suppress ALL "Parameter not found" noise from
// the Tesseract WASM build (tesseract-core-relax_*.wasm.js).
// These warnings come from the LSTM-only engine trying to load legacy
// Tesseract parameters that do not exist in the WASM build.
const _origWarn = console.warn;
console.warn = (...args: unknown[]) => {
  const first = typeof args[0] === 'string' ? args[0] : '';
  // Suppress ALL "Parameter not found" warnings from Tesseract WASM
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

  const worker = await createWorker(lang, 1, {
    // Filter out "Parameter not found" warnings from the WASM runtime
    logger: (m: { status?: string; progress?: number }) => {
      // We intentionally silence all logger output; the WASM runtime
      // emits many "Parameter not found" warnings for legacy params
      // that do not exist in the LSTM-only engine.
      void m;
    },
  });

  try {
    // Only set parameters that the WASM / LSTM-only build actually supports.
    // `preserve_interword_spaces` and several `language_model_*` params
    // are NOT supported and produce console warnings — we skip them.
    await worker.setParameters({
      tessedit_pageseg_mode: '6' as PSM,
    });

    const {
      data: { text },
    } = await worker.recognize(canvas);

    let result = cleanText(text);

    // If result is too short, retry with sparse-text mode (PSM 11)
    if (result.length < 2) {
      await worker.setParameters({
        tessedit_pageseg_mode: '11' as PSM,
      });
      const {
        data: { text: retryText },
      } = await worker.recognize(canvas);
      result = cleanText(retryText);
    }

    return result;
  } finally {
    // Always release the worker, even if OCR throws
    await worker.terminate();
  }
}

/**
 * Alias for ocrFromImageElement — canonical export name for the OCR pipeline.
 * @see ocrFromImageElement
 */
export const extractTextFromImage = ocrFromImageElement;
