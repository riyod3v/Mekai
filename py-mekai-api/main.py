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
os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:128'
os.environ['TORCH_DISABLE_SHM'] = '1'

# ── CPU thread limits ─────────────────────────────────────────
# Railway containers share CPU cores.  Uncontrolled OpenMP / MKL / PaddlePaddle
# threading causes severe contention that makes OCR 3-5× slower and triggers
# the 60-second edge-proxy timeout.  Pinning to 2 threads keeps PaddleOCR fast
# without competing for the scheduler.
os.environ.setdefault('OMP_NUM_THREADS', '2')
os.environ.setdefault('MKL_NUM_THREADS', '2')
os.environ.setdefault('OPENBLAS_NUM_THREADS', '2')
os.environ.setdefault('GOTO_NUM_THREADS', '2')
os.environ.setdefault('FLAGS_num_threads', '2')  # PaddlePaddle flag

import argparse
import base64
import gc
import io
import logging
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
    print(f"Error importing FastAPI: {e}")
    sys.exit(1)

# PIL import
try:
    from PIL import Image
except ImportError as e:
    print(f"Error importing PIL: {e}")
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

    Configuration tuned for manga on Railway (CPU-only, limited RAM):
      - lang="japan"                → Japanese recognition model
      - use_angle_cls=False         → skip angle classification (speed)
      - use_gpu=False               → CPU-only (Railway has no GPU)
      - enable_mkldnn=True          → Intel MKL-DNN acceleration
      - cpu_threads=2               → match OMP_NUM_THREADS env
      - det_limit_side_len=640      → cap detection input size
      - det_db_score_mode="fast"    → faster text-box scoring
      - show_log=False              → reduce noise
    """
    global _paddle_ocr
    if _paddle_ocr is None:
        from paddleocr import PaddleOCR

        log.info("Loading PaddleOCR (japan, CPU-only)…")
        try:
            _paddle_ocr = PaddleOCR(
                lang="japan",
                use_angle_cls=False,
                use_gpu=False,
                show_log=False,
                det_model_dir=None,   # auto-download default det model
                rec_model_dir=None,   # auto-download default japan rec model
                cls_model_dir=None,   # auto-download default cls model
                det_db_score_mode="fast",
                det_db_box_thresh=0.3,
                det_limit_side_len=640,   # cap detection resize
                rec_batch_num=1,
                enable_mkldnn=True,       # Intel MKL-DNN for CPU speed
                cpu_threads=2,            # match thread-limit env vars
                use_mp=False,             # no multiprocessing
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
    """
    import torch
    import re

    acquired = _translate_semaphore.acquire(timeout=_QUEUE_TIMEOUT_S)
    if not acquired:
        raise TimeoutError("Translation queue full — another request is still processing")
    try:
        text = re.sub(r"\s+", "", text)
        tokenizer, model = get_opus_translator()
        inputs = tokenizer(
            text,
            return_tensors="pt",
            truncation=True,
        )
        with torch.no_grad():
            output = model.generate(
                **inputs,
                max_length=512,
                num_beams=4,
                early_stopping=True,
            )
        result = tokenizer.decode(output[0], skip_special_tokens=True)

        del inputs, output
        return result
    finally:
        _translate_semaphore.release()
        gc.collect()

# ─── One-time model installers (CLI) ─────────────────────────

def install_opus_ja_en() -> None:
    """Download and cache the OPUS-MT Helsinki-NLP/opus-mt-ja-en model (~300 MB)."""
    try:
        from transformers import MarianMTModel, MarianTokenizer
    except ImportError:
        print("ERROR: transformers not installed. Run: pip install transformers sentencepiece")
        sys.exit(1)

    print(f"[mekai] Downloading OPUS-MT model '{_OPUS_MODEL_NAME}' (~300 MB). Please wait…")
    MarianTokenizer.from_pretrained(_OPUS_MODEL_NAME)
    MarianMTModel.from_pretrained(_OPUS_MODEL_NAME)
    print("[mekai] OPUS-MT model cached successfully. You can now start the server.")


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

    # Preload translation model
    try:
        log.info("Preloading translation model...")
        get_opus_translator()
    except Exception as exc:
        log.warning("Translation preload failed: %s", exc)

    # Report memory after all models are loaded
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

import re as _re

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
# 640px is the sweet spot for Railway: large enough for PaddleOCR accuracy on
# manga text bubbles, small enough to stay within Railway's 500 MB RAM and
# finish well under the 60s edge timeout.  (800→640 = ~36% fewer pixels.)
_OCR_MAX_DIMENSION = 640

# Minimum dimension — PaddleOCR recognition expects ≥32px height.  Tiny crops
# get upscaled so the recognition model can read them.
_OCR_MIN_DIMENSION = 32

# Maximum base64 payload size (~10 MB encoded ≈ ~7.5 MB raw image)
_MAX_PAYLOAD_BYTES = 10 * 1024 * 1024


def _preprocess_manga_image(img_array):
    """
    Prepare a manga text region for PaddleOCR.

    IMPORTANT: PaddleOCR's Japanese recognition model is trained on
    standard RGB images.  Heavy preprocessing (grayscale conversion,
    CLAHE, aggressive sharpening) was found to *degrade* accuracy —
    especially for thin kana strokes and coloured manga panels.

    Current pipeline (minimal, preserves RGB):
      1. Auto-detect inverted (light-on-dark) panels and flip them so
         PaddleOCR always sees dark text on a light background.
      2. Mild contrast stretch only when the image is very low-contrast.

    No grayscale conversion, no CLAHE, no sharpening kernel.
    """
    import cv2
    import numpy as np

    # Ensure 3-channel RGB
    if len(img_array.shape) == 2:
        img_array = cv2.cvtColor(img_array, cv2.COLOR_GRAY2RGB)

    # Fast luminance check on a small downscaled version to decide inversion
    small = cv2.resize(img_array, (64, 64), interpolation=cv2.INTER_AREA)
    gray_small = cv2.cvtColor(small, cv2.COLOR_RGB2GRAY)
    mean_lum = float(gray_small.mean())
    del small, gray_small

    # If image is predominantly dark, invert so text is dark-on-light
    if mean_lum < 100:
        img_array = cv2.bitwise_not(img_array)
        log.info("Inverted dark panel (mean luminance %.0f)", mean_lum)

    # Mild contrast stretch only if the image is very flat
    gray_check = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    lo, hi = float(gray_check.min()), float(gray_check.max())
    del gray_check
    if (hi - lo) < 80:  # nearly flat histogram
        # Simple linear stretch to [0, 255]
        alpha = 255.0 / max(hi - lo, 1)
        beta = -lo * alpha
        img_array = cv2.convertScaleAbs(img_array, alpha=alpha, beta=beta)
        log.info("Applied contrast stretch (range was %.0f–%.0f)", lo, hi)

    return img_array


def _run_paddle_ocr(img: Image.Image) -> str:
    """
    Run PaddleOCR on a PIL Image and return concatenated text.

    PaddleOCR returns a list of pages, each containing a list of
    (bounding_box, (text, confidence)) tuples.  We concatenate all
    recognised text fragments.

    Image is capped at _OCR_MAX_DIMENSION (640) and tiny crops are
    upscaled to _OCR_MIN_DIMENSION so peak memory stays within
    Railway's 500 MB container limit while preserving OCR accuracy.

    Serialised via _ocr_semaphore so only one OCR inference runs at a
    time — PaddlePaddle is not thread-safe and concurrent calls cause
    hangs / OOM on Railway.
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
        # Free lingering garbage before the heavy work
        gc.collect()

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

        img_array = np.array(img, dtype=np.uint8)
        del img  # free PIL image — we only need the numpy array now

        img_array = _preprocess_manga_image(img_array)

        log.info("Running PaddleOCR on %s array…", img_array.shape)
        results = ocr.ocr(img_array, cls=False)  # type: ignore[union-attr]
        del img_array  # free processed array immediately

        elapsed = time.monotonic() - t0
        log.info("PaddleOCR finished in %.1fs", elapsed)
        _log_memory()

        if not results:
            return ""

        lines: list[str] = []
        for page in results:
            if not page:
                continue
            for detection in page:
                # detection = [bounding_box, (text, score)]
                if detection and len(detection) >= 2:
                    text_info = detection[1]
                    if isinstance(text_info, (list, tuple)) and len(text_info) >= 1:
                        text = str(text_info[0]).strip()
                        if text:
                            lines.append(text)

        del results
        return "".join(lines)

    finally:
        _ocr_semaphore.release()
        gc.collect()


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
        loop = asyncio.get_event_loop()
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
    finally:
        gc.collect()

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

    try:
        loop = asyncio.get_event_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(_translate_executor, _translate_opus, text),
            timeout=30.0,
        )
        return {"translatedText": result}
    except asyncio.TimeoutError:
        log.error("Translation async timeout (30s)")
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
