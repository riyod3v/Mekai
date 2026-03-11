# Mekai API — PaddleOCR + OPUS-MT backend
#
# Replaces the heavyweight manga-ocr server with CPU-only PaddlePaddle OCR
# and OPUS-MT (Helsinki-NLP/opus-mt-ja-en) for high-quality ja→en translation.
# Designed to run within Railway's 500 MB RAM limit.
#
# Endpoints (match the existing frontend contract):
#   GET  /               — root health check
#   GET  /ocr/health     — OCR readiness probe
#   POST /ocr            — Japanese OCR (base64 JSON or multipart file)
#   GET  /translate/health — translation readiness probe
#   POST /translate       — ja→en translation (OPUS-MT)
#
# Quick start:
#   pip install -r requirements.txt
#   python main.py --install-translate   # one-time OPUS-MT model download (~300 MB)
#   python main.py                       # start on :5100

# Fix for PyTorch Windows shared memory issue - MUST be at the very top
import os
import sys as _sys
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:128'

# On Windows, import torch BEFORE PaddlePaddle.  PaddlePaddle modifies the
# DLL search order, which prevents torch's shm.dll from finding its
# dependencies if torch is imported later (e.g. via albumentations).
if _sys.platform == 'win32':
    try:
        import torch  # noqa: F401 — side-effect: registers DLL dirs
    except ImportError:
        pass  # torch not installed; translation features will be unavailable

# ── CPU thread limits ─────────────────────────────────────────
# On Railway (512 MB RAM, 1 shared CPU core) we pin to 2 threads to avoid
# scheduler contention that makes OCR 3-5× slower and triggers the 60-second
# edge-proxy timeout.
#
# Locally we use min(cpu_count, 4) so inference benefits from available cores
# without over-subscribing the scheduler.  The RAILWAY_ENVIRONMENT env var is
# set automatically by Railway; its absence means we are running locally.
_on_railway = bool(os.environ.get('RAILWAY_ENVIRONMENT') or os.environ.get('RAILWAY_PROJECT_ID'))
_cpu_count = os.cpu_count() or 1
_thread_count = str(2 if _on_railway else min(_cpu_count, 4))

os.environ.setdefault('OMP_NUM_THREADS', _thread_count)
os.environ.setdefault('MKL_NUM_THREADS', _thread_count)
os.environ.setdefault('OPENBLAS_NUM_THREADS', _thread_count)
os.environ.setdefault('GOTO_NUM_THREADS', _thread_count)
os.environ.setdefault('FLAGS_num_threads', _thread_count)  # PaddlePaddle flag

import argparse
import base64
import gc
import io
import logging
import re as _re
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from contextlib import asynccontextmanager
from typing import Optional

# FastAPI imports - these might indirectly trigger torch
try:
    from fastapi import FastAPI, File, Request, UploadFile
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
except ImportError as e:
    sys.stderr.write(f"[mekai] CRITICAL  Failed to import FastAPI: {e}\n")
    sys.exit(1)

# PIL import
try:
    from PIL import Image
except ImportError as e:
    sys.stderr.write(f"[mekai] CRITICAL  Failed to import PIL: {e}\n")
    sys.exit(1)

# ─── Logging ───────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="[mekai] %(levelname)s  %(message)s",
)
log = logging.getLogger("mekai")

# Suppress noisy PaddleOCR / PaddlePaddle debug output
logging.getLogger("ppocr").setLevel(logging.WARNING)

# ─── Lazy-loaded singletons ───────────────────────────────────

_paddle_ocr: Optional[object] = None
_opus_tokenizer: Optional[object] = None
_opus_model: Optional[object] = None

_OPUS_MODEL_NAME = "Helsinki-NLP/opus-mt-ja-en"

# Serialise heavy workloads — PaddlePaddle is NOT thread-safe and running
# two OCR calls concurrently doubles peak memory, causing OOM / hangs on
# Railway's constrained containers.  A Semaphore(1) ensures at most one
# OCR (or translation) inference runs at a time; additional requests wait
# in line up to _QUEUE_TIMEOUT_S before getting a 503.
_ocr_semaphore = threading.Semaphore(1)
_translate_semaphore = threading.Semaphore(1)
_QUEUE_TIMEOUT_S = 30  # seconds to wait for a slot before returning 503

# Dedicated single-thread executors for OCR and translation.
# Using a bounded pool (1 worker) instead of the default thread-pool prevents
# unbounded thread creation and guarantees natural FIFO serialisation.
_ocr_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="ocr")
_translate_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="translate")


def _log_memory():
    """Log current process RSS for Railway debugging."""
    try:
        import resource
        rss_kb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        log.info("Peak RSS: %.1f MB", rss_kb / 1024)
    except Exception:
        pass


def get_paddle_ocr():
    """
    Return the cached PaddleOCR instance, creating it on first call.

    Configuration tuned for manga (CPU-only):
      - lang="japan"                → Japanese recognition model
      - use_angle_cls=True          → classify text angle (vertical manga)
      - use_gpu=False               → CPU-only (Railway has no GPU)
      - enable_mkldnn=True          → Intel MKL-DNN acceleration on CPU
      - cpu_threads=_thread_count   → matches OMP_NUM_THREADS (2 on Railway, up to 4 locally)
      - det_limit_side_len=512      → cap detection input size
      - det_db_box_thresh=0.2       → lower threshold catches more manga text
      - det_db_unclip_ratio=1.8     → wider text regions for tight kana spacing
      - use_space_char=False         → no false spaces in Japanese output
      - show_log=False              → reduce noise

    The frontend already crops speech bubbles, but detection is still used
    to find individual text lines within each bubble.
    """
    global _paddle_ocr
    if _paddle_ocr is None:
        from paddleocr import PaddleOCR

        log.info("Loading PaddleOCR (japan, CPU-only, threads=%s)…", _thread_count)
        try:
            _paddle_ocr = PaddleOCR(
                lang="japan",
                use_angle_cls=True,
                use_gpu=False,
                show_log=False,
                # ── Detection tuning ──
                det_db_score_mode="fast",
                det_db_box_thresh=0.2,
                det_db_unclip_ratio=1.8,   # wider unclip for tight manga text / small kana
                det_limit_side_len=512 if _on_railway else 960,
                # ── Recognition tuning ──
                rec_batch_num=1,
                use_space_char=False,       # Japanese has no inter-word spaces
                # ── Runtime ──
                enable_mkldnn=True,         # Intel MKL-DNN acceleration on CPU
                cpu_threads=int(_thread_count),
                use_mp=False,
            )
            log.info("PaddleOCR ready.")
            _log_memory()
        except Exception as e:
            log.error("Failed to initialize PaddleOCR: %s", e)
            raise
        gc.collect()
    return _paddle_ocr


def get_opus_translator():
    """
    Return the cached OPUS-MT (MarianMT) tokenizer and model as a tuple.

    Loads from the local HuggingFace cache.  Run
    `python main.py --install-translate` once to download the model.
    Raises RuntimeError if the model is not cached.
    """
    global _opus_tokenizer, _opus_model
    if _opus_tokenizer is None or _opus_model is None:
        try:
            from transformers import MarianMTModel, MarianTokenizer
        except ImportError:
            raise RuntimeError(
                "transformers is not installed. Run: pip install transformers sentencepiece"
            )
        try:
            log.info("Loading OPUS-MT model '%s'…", _OPUS_MODEL_NAME)
            _opus_tokenizer = MarianTokenizer.from_pretrained(
                _OPUS_MODEL_NAME, local_files_only=True
            )
            _opus_model = MarianMTModel.from_pretrained(
                _OPUS_MODEL_NAME, local_files_only=True
            )
            log.info("OPUS-MT ja→en ready.")
        except Exception:
            raise RuntimeError(
                f"OPUS-MT model '{_OPUS_MODEL_NAME}' is not cached locally. "
                "Run once: python main.py --install-translate"
            )
    return _opus_tokenizer, _opus_model


def _translate_opus(text: str) -> str:
    """Translate *text* from Japanese to English using the cached OPUS-MT model.

    Serialised via _translate_semaphore so concurrent calls don't double
    PyTorch memory on Railway's constrained containers.

    Requires PyTorch (CPU-only build is sufficient).  If torch is not installed,
    raises RuntimeError with installation instructions.
    """
    try:
        import torch
    except ImportError:
        raise RuntimeError(
            "PyTorch is not installed.  Install the CPU-only build locally with:\n"
            "  pip install torch --index-url https://download.pytorch.org/whl/cpu\n"
            "Then restart the server."
        )

    acquired = _translate_semaphore.acquire(timeout=_QUEUE_TIMEOUT_S)
    if not acquired:
        raise TimeoutError("Translation queue full — another request is still processing")
    try:
        text = text.strip()
        tokenizer, model = get_opus_translator()
        inputs = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
        )
        with torch.no_grad():
            output = model.generate(
                **inputs,
                max_length=256,
                num_beams=_TRANSLATE_NUM_BEAMS,
                no_repeat_ngram_size=3,  # prevents repetitive output artifacts
                length_penalty=0.9,     # slightly prefer natural-length output
                early_stopping=True,
            )
        result = tokenizer.decode(output[0], skip_special_tokens=True)

        del inputs, output
        return result
    finally:
        _translate_semaphore.release()

# ─── One-time model installers (CLI) ─────────────────────────

def install_opus_ja_en() -> None:
    """Download and cache the OPUS-MT Helsinki-NLP/opus-mt-ja-en model (~300 MB)."""
    try:
        from transformers import MarianMTModel, MarianTokenizer
    except ImportError:
        log.error("transformers not installed. Run: pip install transformers sentencepiece")
        sys.exit(1)

    log.info("Downloading OPUS-MT model '%s' (~300 MB). Please wait…", _OPUS_MODEL_NAME)
    MarianTokenizer.from_pretrained(_OPUS_MODEL_NAME)
    MarianMTModel.from_pretrained(_OPUS_MODEL_NAME)
    log.info("OPUS-MT model cached successfully. You can now start the server.")


def predownload_paddle_models() -> None:
    """
    Pre-download PaddleOCR models so they are baked into the Docker image.
    Called during `docker build` via `python main.py --install-ocr`.
    """
    log.info("Pre-downloading PaddleOCR models…")
    get_paddle_ocr()
    log.info("PaddleOCR models cached.")


# ─── CORS configuration ──────────────────────────────────────

# Origins that are always allowed regardless of env vars
_REQUIRED_ORIGINS = [
    "https://mekaiscans.vercel.app",
]

_env_origins = os.environ.get("MEKAI_ALLOWED_ORIGINS", "")
if _env_origins:
    _extra = [
        o.strip()
        for o in _env_origins.replace("\r", "").replace("\n", ",").split(",")
        if o.strip()
    ]
else:
    _extra = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://127.0.0.1:60915",
    ]

# Merge: required origins always present, then env/default extras (deduped)
ALLOWED_ORIGINS = list(dict.fromkeys(_REQUIRED_ORIGINS + _extra))

# ─── FastAPI app ──────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI):
    log.info("Mekai API starting — preloading models at startup.")
    log.info("Allowed CORS origins: %s", ALLOWED_ORIGINS)
    log.info("Running on %s (Railway=%s, CPUs=%d, thread_count=%s)",
             "Railway" if _on_railway else "local", _on_railway, _cpu_count, _thread_count)
    log.info("CPU thread limits: OMP=%s  MKL=%s  PADDLE=%s",
             os.environ.get('OMP_NUM_THREADS'), os.environ.get('MKL_NUM_THREADS'),
             os.environ.get('FLAGS_num_threads'))

    # Preload PaddleOCR so the first /ocr request doesn't timeout
    try:
        log.info("Loading PaddleOCR model...")
        get_paddle_ocr()
        log.info("PaddleOCR ready.")
    except Exception as exc:
        log.warning("PaddleOCR preload failed: %s", exc)

    # Preload translation model on local environments to avoid 60s first-request timeout.
    # On Railway, load lazily to save ~200 MB RAM and ~10-15s cold start time.
    if _on_railway:
        log.info("Translation model will load on first /translate request (Railway mode).")
    else:
        try:
            log.info("Loading OPUS-MT translation model (local mode)...")
            get_opus_translator()
            log.info("Translation model ready.")
        except Exception as exc:
            log.warning("Translation model preload failed: %s", exc)
            log.warning("Translation will be unavailable until model is installed.")

    _log_memory()
    gc.collect()
    log.info("Startup complete — ready to serve requests.")

    yield

    # Shutdown: clean up executors
    _ocr_executor.shutdown(wait=False)
    _translate_executor.shutdown(wait=False)
    log.info("Mekai API shutting down.")


app = FastAPI(
    title="Mekai API",
    description="Lightweight manga OCR + translation service",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$|^https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ─── Global exception handler — ensures CORS headers on 5xx ──

def _is_origin_allowed(origin: str) -> bool:
    """Return True if origin is in the explicit list or matches *.vercel.app."""
    if not origin:
        return False
    if origin in ALLOWED_ORIGINS:
        return True
    # Also accept any Vercel preview/branch deploy
    if _re.match(r"^https://.*\.vercel\.app$", origin):
        return True
    return False


@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all so that unhandled errors still carry CORS headers.
    Without this, Railway's proxy might swallow the response and the
    browser sees a bare 502 without Access-Control-Allow-Origin.
    """
    origin = request.headers.get("origin", "")
    headers = {}
    if _is_origin_allowed(origin):
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    log.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal server error"},
        headers=headers,
    )


@app.middleware("http")
async def _cors_safety_net(request: Request, call_next):
    """
    Safety-net middleware that adds CORS headers even when an upstream
    middleware or handler raises before CORSMiddleware can inject them.
    Also handles preflight OPTIONS explicitly as a fallback.
    """
    origin = request.headers.get("origin", "")

    # Fast-path: preflight OPTIONS
    if request.method == "OPTIONS":
        headers = {
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
            "Access-Control-Allow-Headers": "*",
            "Access-Control-Max-Age": "86400",
        }
        if _is_origin_allowed(origin):
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        return JSONResponse(content="", status_code=200, headers=headers)

    try:
        response = await call_next(request)
    except Exception:
        # If *anything* blows up, return a CORS-safe 500
        headers = {}
        if _is_origin_allowed(origin):
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"},
            headers=headers,
        )

    # Ensure the header is present even if CORSMiddleware didn't fire
    if (
        _is_origin_allowed(origin)
        and "access-control-allow-origin" not in response.headers
    ):
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"

    return response


# ─── Helper: image decoding ──────────────────────────────────

def _decode_base64_image(image_b64: str) -> Image.Image:
    """Decode a base64 (with optional data-URL prefix) string to a PIL Image."""
    if "," in image_b64:
        image_b64 = image_b64.split(",", 1)[1]
    img_bytes = base64.b64decode(image_b64)
    return Image.open(io.BytesIO(img_bytes)).convert("RGB")


# Maximum dimension (width or height) for OCR input — keeps memory under control.
# Railway (512 MB RAM): cap at 512 to stay within constraints.
# Local: 960 gives ~3.5× more pixels, dramatically improving recognition of
# complex kanji (e.g. 様 vs 機) and katakana/hiragana disambiguation.
_OCR_MAX_DIMENSION = 512 if _on_railway else 960

# Minimum dimension — PaddleOCR recognition expects ≥32px height.  Tiny crops
# get upscaled so the recognition model can read them.  Locally we use 64 so
# small bubbles get enough detail for accurate stroke recognition.
_OCR_MIN_DIMENSION = 32 if _on_railway else 64

# Maximum base64 payload size (~10 MB encoded ≈ ~7.5 MB raw image)
_MAX_PAYLOAD_BYTES = 10 * 1024 * 1024

# Translation beam width — more beams = better quality at the cost of CPU + RAM.
# 4 beams is the standard quality setting for MarianMT / OPUS-MT; Railway uses
# 2 to stay within 512 MB RAM.
_TRANSLATE_NUM_BEAMS = 2 if _on_railway else 4


def _preprocess_manga_image(img_array):
    """
    Minimal preprocessing for manga speech-bubble crops.

    PaddleOCR's Japanese recognition model is trained on standard RGB
    images.  Heavy preprocessing (grayscale, CLAHE, sharpening) degrades
    accuracy — especially thin kana strokes.  We only:
      1. Ensure 3-channel RGB.
      2. Auto-detect inverted (light-on-dark) panels and flip them.
      3. Light contrast stretch for washed-out / low-contrast panels.

    No grayscale conversion, no heavy filtering.
    Minimises numpy copies to keep RAM under Railway's 512 MB limit.
    """
    import cv2

    # Ensure 3-channel RGB
    if len(img_array.shape) == 2:
        img_array = cv2.cvtColor(img_array, cv2.COLOR_GRAY2RGB)

    # Fast luminance check on a tiny downscale to decide inversion
    small = cv2.resize(img_array, (32, 32), interpolation=cv2.INTER_AREA)
    gray_small = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    mean_lum = float(gray_small.mean())
    std_lum = float(gray_small.std())
    del small, gray_small

    # If image is predominantly dark, invert so text is dark-on-light
    if mean_lum < 100:
        img_array = cv2.bitwise_not(img_array)
        log.info("Inverted dark panel (mean luminance %.0f)", mean_lum)

    # Light contrast stretch for low-contrast panels (e.g. gray text on
    # off-white background).  Only applied when std deviation is very low,
    # meaning the image lacks dynamic range.  Uses convertScaleAbs which
    # is fast and in-place-friendly.
    elif std_lum < 35:
        img_array = cv2.convertScaleAbs(img_array, alpha=1.3, beta=10)

    # Light unsharp-mask to bring out fine stroke edges — helps PaddleOCR
    # distinguish similar kanji (e.g. 様 vs 機) and kana script types.
    # Radius=1.0, amount=0.3 is conservative enough to avoid amplifying noise.
    blurred = cv2.GaussianBlur(img_array, (0, 0), 1.0)
    img_array = cv2.addWeighted(img_array, 1.3, blurred, -0.3, 0)
    del blurred

    return img_array


def _clean_ocr_text(text: str) -> str:
    """
    Normalise raw PaddleOCR output before sending to the translation model.

    1. NFKC normalisation — converts half-width katakana to full-width (e.g.
       ｶ → カ), decomposes compatibility ligatures, and normalises digits so
       OPUS-MT tokenisation is consistent with its training data.
    2. Strip whitespace between consecutive Japanese characters — PaddleOCR
       sometimes inserts spaces inside a word (「行 く か」→「行くか」) as a
       side-effect of treating each glyph as a separate detection.
    3. Remove stray runs of 3+ Latin / accented-ASCII characters that are OCR
       noise from artwork borders or furigana that survived the area filter.
    """
    import unicodedata

    text = text.strip()
    if not text:
        return text

    # 1) NFKC normalisation
    text = unicodedata.normalize('NFKC', text)

    # 2) Remove spaces between adjacent Japanese characters
    #    Range covers hiragana, katakana, CJK ideographs, CJK punctuation,
    #    and fullwidth/halfwidth forms.
    text = _re.sub(
        r'(?<=[\u3000-\u9fff\uff00-\uffef])\s+(?=[\u3000-\u9fff\uff00-\uffef])',
        '',
        text,
    )

    # 3) Drop runs of 3+ Latin/accented-ASCII that are OCR noise
    text = _re.sub(r'[a-zA-Z\u00c0-\u00ff]{3,}', '', text)

    return text.strip()


def _run_paddle_ocr(img: Image.Image) -> str:
    """
    Run PaddleOCR on a pre-cropped speech bubble (detection + recognition).

    Detection finds text regions within the bubble, then recognition reads
    each region.  Fragments are sorted in **manga reading order** (right-to-
    left columns, top-to-bottom within each column) before joining.

    Image is capped at _OCR_MAX_DIMENSION (512px) and tiny crops are
    upscaled to _OCR_MIN_DIMENSION (32px).  Serialised via
    _ocr_semaphore so only one inference runs at a time.
    """
    import numpy as np

    t0 = time.monotonic()

    # ── Acquire exclusive OCR slot ────────────────────────────
    acquired = _ocr_semaphore.acquire(timeout=_QUEUE_TIMEOUT_S)
    if not acquired:
        raise TimeoutError(
            "OCR queue full — another request is still processing. "
            "Please retry in a few seconds."
        )

    try:
        ocr = get_paddle_ocr()

        log.info("OCR input image: %dx%d", img.width, img.height)

        # ── Resize: cap at _OCR_MAX_DIMENSION, upscale tiny crops ─
        max_dim = max(img.width, img.height)
        min_dim = min(img.width, img.height)

        if max_dim > _OCR_MAX_DIMENSION:
            scale = _OCR_MAX_DIMENSION / max_dim
            new_w = max(int(img.width * scale), 1)
            new_h = max(int(img.height * scale), 1)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            log.info("Downscaled to %dx%d for OCR", new_w, new_h)
        elif min_dim < _OCR_MIN_DIMENSION:
            # Very small crop — upscale so recognition model can read it
            scale = _OCR_MIN_DIMENSION / min_dim
            new_w = int(img.width * scale)
            new_h = int(img.height * scale)
            img = img.resize((new_w, new_h), Image.LANCZOS)
            log.info("Upscaled tiny crop to %dx%d for OCR", new_w, new_h)

        img_w = img.width  # save for reading-order sort later
        img_array = np.array(img, dtype=np.uint8)
        del img  # free PIL image — we only need the numpy array now

        img_array = _preprocess_manga_image(img_array)

        log.info("Running PaddleOCR on %s array…", img_array.shape)
        results = ocr.ocr(
            img_array,
            cls=True,
        )  # type: ignore[union-attr]
        del img_array  # free processed array immediately

        elapsed = time.monotonic() - t0
        log.info("PaddleOCR finished in %.1fs", elapsed)
        _log_memory()

        if not results:
            return ""

        # ── Extract text segments with positions ─────────────────
        # det=True format:  [[[bbox, (text, confidence)], ...]]
        #   bbox = [[x1,y1],[x2,y2],[x3,y3],[x4,y4]]
        # We collect (center_x, center_y, text) for reading-order sort.
        _MIN_CONFIDENCE = 0.3  # drop noisy low-confidence detections
        # cx, cy, text, bbox_area, bbox_height
        segments: list[tuple[float, float, str, float, float]] = []

        for page in results:
            if not page:
                continue
            for item in page:
                if not item or len(item) < 2:
                    continue
                bbox_or_text = item[0]
                text_info = item[1]

                if isinstance(bbox_or_text, list) and bbox_or_text and isinstance(bbox_or_text[0], (list, tuple)):
                    # det=True: bbox_or_text is [[x,y], ...], text_info is (text, score)
                    if isinstance(text_info, (list, tuple)) and len(text_info) >= 2:
                        score = float(text_info[1])
                        if score < _MIN_CONFIDENCE:
                            continue
                        text = str(text_info[0]).strip()
                    else:
                        text = str(text_info).strip()
                    if not text:
                        continue
                    cx = sum(p[0] for p in bbox_or_text) / len(bbox_or_text)
                    cy = sum(p[1] for p in bbox_or_text) / len(bbox_or_text)
                    xs = [p[0] for p in bbox_or_text]
                    ys = [p[1] for p in bbox_or_text]
                    area = (max(xs) - min(xs)) * (max(ys) - min(ys))
                    height = max(ys) - min(ys)
                    segments.append((cx, cy, text, area, height))
                else:
                    # det=False fallback: item is (text, score)
                    text = str(bbox_or_text).strip()
                    if text:
                        segments.append((0.0, float(len(segments)), text, 0.0, 0.0))

        del results

        if not segments:
            return ""

        # ── Furigana filter ───────────────────────────────────────
        # Furigana (ruby text) printed beside kanji creates small bounding
        # boxes that PaddleOCR picks up as separate text segments, inserting
        # hiragana readings into the middle of the main text.
        # Dual filter — a segment is furigana if EITHER:
        #   • its bbox area  < 25% of the median detection area, OR
        #   • its bbox height < 40% of the median detection height.
        # Height is more reliable than area alone because furigana is always
        # significantly shorter than the main text, even if it spans a wide
        # horizontal extent alongside a column of characters.
        if len(segments) > 1:
            det_areas   = sorted(s[3] for s in segments if s[3] > 0)
            det_heights = sorted(s[4] for s in segments if s[4] > 0)
            median_area   = det_areas[len(det_areas) // 2] if det_areas else 0
            median_height = det_heights[len(det_heights) // 2] if det_heights else 0

            if median_area > 0 or median_height > 0:
                before = len(segments)
                kept: list[tuple[float, float, str, float, float]] = []
                for s in segments:
                    # Keep all fallback segments (area/height == 0)
                    if s[3] == 0.0 and s[4] == 0.0:
                        kept.append(s)
                        continue
                    is_tiny_area   = median_area > 0 and s[3] < median_area * 0.25
                    is_tiny_height = median_height > 0 and s[4] < median_height * 0.40
                    if is_tiny_area or is_tiny_height:
                        log.info(
                            "  Furigana dropped: %r  (area=%.0f/%.0f=%.0f%%  h=%.0f/%.0f=%.0f%%)",
                            s[2], s[3], median_area, s[3] / max(median_area, 1) * 100,
                            s[4], median_height, s[4] / max(median_height, 1) * 100,
                        )
                        continue
                    kept.append(s)
                if len(kept) < before:
                    log.info(
                        "Furigana filter removed %d segment(s) (median area=%.0f px², median h=%.0f px)",
                        before - len(kept), median_area, median_height,
                    )
                segments = kept

        # ── Sort in manga reading order ──────────────────────────
        # Manga reads right-to-left columns, top-to-bottom within.
        # Group detections into columns: segments whose X centres are
        # within 20% of image width are treated as the same column.
        if len(segments) > 1:
            segments.sort(key=lambda s: -s[0])  # right-to-left first
            col_thresh = max(img_w * 0.20, 15)  # pixels
            columns: list[list[tuple[float, float, str, float, float]]] = [[segments[0]]]
            for seg in segments[1:]:
                if abs(seg[0] - columns[-1][0][0]) < col_thresh:
                    columns[-1].append(seg)
                else:
                    columns.append([seg])
            # Within each column, sort top-to-bottom
            ordered: list[str] = []
            for col in columns:
                col.sort(key=lambda s: s[1])
                ordered.extend(s[2] for s in col)
        else:
            ordered = [segments[0][2]]

        raw_text = "".join(ordered)
        cleaned = _clean_ocr_text(raw_text)
        log.info("OCR segments (%d) raw=%r  cleaned=%r", len(ordered), raw_text, cleaned)
        return cleaned

    finally:
        _ocr_semaphore.release()


# ─── Health endpoints ─────────────────────────────────────────


@app.get("/")
async def root():
    """Root health check."""
    return {"status": "ok", "service": "mekai-api"}


@app.get("/ocr/health")
async def ocr_health():
    """Probe: returns 200 when OCR service is available (models load on demand)."""
    # On Windows, we don't pre-load PaddleOCR to avoid shm.dll issues
    if os.name == 'nt':
        return {
            "status": "ok", 
            "note": "PaddleOCR loads on first OCR request (Windows compatibility mode)"
        }
    return {"status": "ok", "note": "Models load on first OCR request"}


@app.get("/translate/health")
async def translate_health():
    """Probe: returns 200 when translation service is available (models load on demand)."""
    return {"status": "ok", "note": "Models load on first translation request"}


# ─── OCR endpoint ─────────────────────────────────────────────


@app.post("/ocr")
async def ocr(
    request: Request,
    file: Optional[UploadFile] = File(None),
):
    """
    Run PaddleOCR on a manga panel image.

    Accepts either:
      • **multipart/form-data** with field ``file`` (binary upload)
      • **JSON body**: ``{ "image": "<base64 or data-url>" }``

    Returns: ``{ "text": "recognised Japanese text" }``
    """
    import asyncio

    log.info("OCR request received")
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type and file is not None:
        # ── multipart upload path ─────────────────────────────
        try:
            raw = await file.read()
            if len(raw) > _MAX_PAYLOAD_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"error": "Image too large (max ~10 MB)"},
                )
            img = Image.open(io.BytesIO(raw)).convert("RGB")
            del raw  # free encoded bytes immediately
        except Exception as exc:
            return JSONResponse(
                status_code=400,
                content={"error": f"Invalid image: {exc}"},
            )
    else:
        # ── JSON / base64 path ────────────────────────────────
        try:
            body = await request.json()
        except Exception:
            return JSONResponse(
                status_code=400,
                content={"error": "Expected JSON body with 'image' field"},
            )
        image_b64: str = body.get("image", "")
        del body  # free the parsed JSON dict
        if not image_b64:
            return JSONResponse(
                status_code=400,
                content={"error": "Missing 'image' field in JSON body"},
            )
        if len(image_b64) > _MAX_PAYLOAD_BYTES:
            return JSONResponse(
                status_code=413,
                content={"error": "Image too large (max ~10 MB base64)"},
            )
        try:
            img = _decode_base64_image(image_b64)
            del image_b64  # free base64 string immediately
        except Exception as exc:
            return JSONResponse(
                status_code=400,
                content={"error": f"Invalid base64 image: {exc}"},
            )

    try:
        # Run OCR in a dedicated single-thread executor with a 50-second
        # timeout — leaves ~10s headroom before Railway's 60s edge proxy
        # timeout.  The dedicated executor prevents unbounded thread creation.
        loop = asyncio.get_running_loop()
        text = await asyncio.wait_for(
            loop.run_in_executor(_ocr_executor, _run_paddle_ocr, img),
            timeout=50.0,
        )
        del img
        return {"text": text}
    except asyncio.TimeoutError:
        log.error("OCR async timeout (50s) — likely Railway CPU contention")
        return JSONResponse(
            status_code=504,
            content={"error": "OCR processing timed out — image may be too complex. Try a smaller crop."},
        )
    except TimeoutError as exc:
        log.error("OCR semaphore timeout: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"error": "OCR busy — another request is still processing. Please retry in a few seconds."},
        )
    except Exception as exc:
        log.error("OCR failed: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": str(exc)},
        )

@app.post("/ocr/debug")
async def ocr_debug(file: UploadFile = File(...)):
    """
    Debug OCR endpoint for testing image uploads directly.
    """

    try:
        raw = await file.read()
        if len(raw) > _MAX_PAYLOAD_BYTES:
            return JSONResponse(
                status_code=413,
                content={"success": False, "error": "Image too large (max ~10 MB)"},
            )
        img = Image.open(io.BytesIO(raw)).convert("RGB")
        del raw

        log.info("OCR debug request received")

        text = _run_paddle_ocr(img)
        del img

        return {
            "success": True,
            "text": text
        }

    except Exception as exc:
        log.error("OCR debug failed: %s", exc)

        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": str(exc)
            }
        )

    finally:
        gc.collect()

@app.post("/translate/debug")
async def translate_debug(request: Request):
    """
    Debug translation endpoint.
    """

    try:
        body = await request.json()
        text = body.get("text", "")

        if not text:
            return {"translatedText": ""}

        log.info("Translation debug request received")

        result = _translate_opus(text)

        return {
            "input": text,
            "translatedText": result
        }

    except Exception as exc:
        log.error("Translation debug failed: %s", exc)

        return JSONResponse(
            status_code=500,
            content={
                "error": str(exc)
            }
        )

    finally:
        gc.collect()
# ─── Translation endpoint ────────────────────────────────────


@app.post("/translate")
async def translate(request: Request):
    """
    Translate Japanese → English via OPUS-MT (Helsinki-NLP/opus-mt-ja-en).

    Accepts JSON: ``{ "q": "日本語テキスト", "source": "ja", "target": "en" }``
    Returns JSON: ``{ "translatedText": "English text" }``
    """
    try:
        body = await request.json()
    except Exception:
        return JSONResponse(
            status_code=400,
            content={"error": "Expected JSON body"},
        )

    text: str = body.get("q", "").strip()
    if not text:
        return {"translatedText": ""}

    import asyncio

    # Use longer timeout locally (60s) for slower CPUs and first-time model loading.
    # Railway uses 30s since it has the model pre-cached in the Docker image.
    translate_timeout = 30.0 if _on_railway else 60.0

    try:
        loop = asyncio.get_running_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(_translate_executor, _translate_opus, text),
            timeout=translate_timeout,
        )
        return {"translatedText": result}
    except asyncio.TimeoutError:
        log.error("Translation async timeout (%.0fs)", translate_timeout)
        return JSONResponse(
            status_code=504,
            content={"error": "Translation timed out. Please retry."},
        )
    except TimeoutError as exc:
        log.error("Translation semaphore timeout: %s", exc)
        return JSONResponse(
            status_code=503,
            content={"error": "Translation busy — please retry in a few seconds."},
        )
    except Exception as exc:
        log.error("Translation failed: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"error": str(exc)},
        )


# ─── CLI entrypoint ──────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mekai API server")
    parser.add_argument("--port", type=int, default=5100, help="Port (default 5100)")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address")
    parser.add_argument(
        "--install-translate",
        action="store_true",
        help="One-time download of the OPUS-MT ja→en model (~300 MB), then exit.",
    )
    parser.add_argument(
        "--install-ocr",
        action="store_true",
        help="Pre-download PaddleOCR models (used in Dockerfile), then exit.",
    )
    args = parser.parse_args()

    if args.install_translate:
        install_opus_ja_en()
        sys.exit(0)

    if args.install_ocr:
        predownload_paddle_models()
        sys.exit(0)

    port = int(os.environ.get("PORT", args.port))

    log.info("Starting Mekai API on http://%s:%d", args.host, port)
    log.info("Allowed CORS origins: %s", ALLOWED_ORIGINS)

    import uvicorn

    uvicorn.run(
        "main:app",
        host=args.host,
        port=port,
        workers=1,
        log_level="info",
    )
