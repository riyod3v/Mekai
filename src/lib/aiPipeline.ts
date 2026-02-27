// src/lib/aiPipeline.ts
import { supabase } from '@/lib/supabase';
import { ocrFromImageElement, type BBox } from '@/lib/ocr';
import { translateJapaneseToEnglish } from '@/lib/translate';
import { toRomaji } from '@/lib/romaji';

type EdgePayload = {
  ocrText?: unknown;
  translated?: unknown;
  romaji?: unknown;
};

async function getEdgeErrorDetails(error: unknown): Promise<string> {
  const maybeContext =
    typeof error === 'object' &&
    error !== null &&
    'context' in error
      ? (error as { context?: unknown }).context
      : undefined;

  if (!(maybeContext instanceof Response)) {
    return String(error instanceof Error ? error.message : error);
  }

  let body = '';
  try {
    body = (await maybeContext.clone().text()).trim();
  } catch {
    body = '';
  }

  const statusPart = `status=${maybeContext.status}`;
  const bodyPart = body ? ` body=${body}` : '';
  return `${statusPart}${bodyPart}`;
}

async function invokeOcrTranslate(imageDataUrl: string): Promise<EdgePayload> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData.session?.access_token;

  // --- Debug: verify session matches the configured project ---
  console.debug('[aiPipeline] Supabase project URL:', import.meta.env.VITE_SUPABASE_URL);
  console.debug('[aiPipeline] Access token exists:', !!accessToken);
  // ------------------------------------------------------------

  if (!accessToken) {
    throw new Error('Edge invoke aborted: no authenticated session token available.');
  }

  const { data, error } = await supabase.functions.invoke('ocr-translate', {
    body: { imageDataUrl },
  });

  if (error) {
    const details = await getEdgeErrorDetails(error);
    throw new Error(`[ocr-translate] invoke failed: ${details}`);
  }

  return (data ?? {}) as EdgePayload;
}

export async function callEdge(imageDataUrl: string) {
  return await invokeOcrTranslate(imageDataUrl);
}

export type OcrTranslateResult = {
  ocrText: string;
  translated: string;
  romaji: string | null;
};

type Options = {
  preferEdge?: boolean;
  edgeOnly?: boolean;
};

export async function ocrAndTranslate(
  imgEl: HTMLImageElement,
  bbox: BBox,
  opts: Options = {},
): Promise<OcrTranslateResult> {
  const preferEdge = opts.preferEdge ?? true;

  if (preferEdge) {
    try {
      const res = await ocrAndTranslateViaEdge(imgEl, bbox);
      if (res.ocrText.trim()) return res;
      throw new Error('Edge returned empty OCR text.');
    } catch (e) {
      if (opts.edgeOnly) throw e;
      console.warn('[ocrAndTranslate] Edge failed, falling back to local:', e);
    }
  }

  // Local fallback
  const raw = await ocrFromImageElement(imgEl, bbox, 'jpn');
  const ocrText = raw.trim();
  if (!ocrText) return { ocrText: '', translated: '', romaji: null };

  const translated = await translateJapaneseToEnglish(ocrText);
  const romaji = toRomaji(ocrText);

  return { ocrText, translated, romaji };
}

function cropRegionToDataUrl(imgEl: HTMLImageElement, bbox: BBox, upscale = 2): string {
  const nw = imgEl.naturalWidth;
  const nh = imgEl.naturalHeight;

  const cropX = Math.round(bbox.x * nw);
  const cropY = Math.round(bbox.y * nh);
  const cropW = Math.max(Math.round(bbox.w * nw), 1);
  const cropH = Math.max(Math.round(bbox.h * nh), 1);

  const canvas = document.createElement('canvas');
  canvas.width = cropW * upscale;
  canvas.height = cropH * upscale;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas context.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.drawImage(imgEl, cropX, cropY, cropW, cropH, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

async function ocrAndTranslateViaEdge(imgEl: HTMLImageElement, bbox: BBox): Promise<OcrTranslateResult> {
  const imageDataUrl = cropRegionToDataUrl(imgEl, bbox, 2);
  const data = await invokeOcrTranslate(imageDataUrl);

  return {
    ocrText: String(data?.ocrText ?? '').trim(),
    translated: String(data?.translated ?? '').trim(),
    romaji: data?.romaji ? String(data.romaji) : null,
  };
}