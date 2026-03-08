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

import argparse
import base64
import gc
import io
import logging
import sys
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


def get_paddle_ocr():
    """
    Return the cached PaddleOCR instance, creating it on first call.

    Configuration tuned for manga:
      - lang="japan"  → Japanese recognition model
      - use_angle_cls=True  → handles rotated / vertical text
      - use_gpu=False → CPU-only (Railway has no GPU)
      - det_db_score_mode="slow" → better text detection accuracy
      - show_log=False → reduce noise
    """
    global _paddle_ocr
    if _paddle_ocr is None:
        # Ensure environment variables are set before importing PaddleOCR
        os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:128'
        os.environ['TORCH_DISABLE_SHM'] = '1'
        
        from paddleocr import PaddleOCR

        log.info("Loading PaddleOCR (japan, CPU-only)…")
        try:
            _paddle_ocr = PaddleOCR(
                lang="japan",
                use_angle_cls=True,
                use_gpu=False,
                show_log=False,
                det_model_dir=None,   # auto-download default det model
                rec_model_dir=None,   # auto-download default japan rec model
                cls_model_dir=None,   # auto-download default cls model
                det_db_score_mode="slow",
                det_db_box_thresh=0.3,
                rec_batch_num=2,
            )
            log.info("PaddleOCR ready.")
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
        # Ensure environment variables are set before importing transformers
        os.environ['PYTORCH_CUDA_ALLOC_CONF'] = 'max_split_size_mb:128'
        os.environ['TORCH_DISABLE_SHM'] = '1'
        
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
    """Translate *text* from Japanese to English using the cached OPUS-MT model."""
    import torch

    tokenizer, model = get_opus_translator()
    inputs = tokenizer(
        text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512,
    )
    with torch.no_grad():
        output = model.generate(**inputs)
    return tokenizer.decode(output[0], skip_special_tokens=True)
    
    del inputs
    del output
    gc.collect()

    return result

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

    yield


app = FastAPI(
    title="Mekai API",
    description="Lightweight manga OCR + translation service",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)


# ─── Global exception handler — ensures CORS headers on 5xx ──

@app.exception_handler(Exception)
async def _global_exception_handler(request: Request, exc: Exception):
    """
    Catch-all so that unhandled errors still carry CORS headers.
    Without this, Railway's proxy might swallow the response and the
    browser sees a bare 502 without Access-Control-Allow-Origin.
    """
    origin = request.headers.get("origin", "")
    headers = {}
    if origin in ALLOWED_ORIGINS or any(
        origin.startswith(o) for o in ALLOWED_ORIGINS
    ):
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
        if origin in ALLOWED_ORIGINS:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        return JSONResponse(content="", status_code=200, headers=headers)

    try:
        response = await call_next(request)
    except Exception:
        # If *anything* blows up, return a CORS-safe 500
        headers = {}
        if origin in ALLOWED_ORIGINS:
            headers["Access-Control-Allow-Origin"] = origin
            headers["Access-Control-Allow-Credentials"] = "true"
        return JSONResponse(
            status_code=500,
            content={"error": "Internal server error"},
            headers=headers,
        )

    # Ensure the header is present even if CORSMiddleware didn't fire
    if (
        origin in ALLOWED_ORIGINS
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


def _preprocess_manga_image(img_array):
    """
    Prepare a manga text region for PaddleOCR.

    Pipeline: grayscale → CLAHE → unsharp sharpen.

    Thresholding / dilation is intentionally omitted — manga has thin
    kana strokes that binarisation destroys, causing PaddleOCR to miss
    entire text lines.  A light sharpen improves edge definition without
    altering stroke width.
    """
    import cv2
    import numpy as np

    # 1. Grayscale
    if len(img_array.shape) == 3:
        gray = cv2.cvtColor(img_array, cv2.COLOR_RGB2GRAY)
    else:
        gray = img_array

    # 2. CLAHE — adaptive contrast enhancement
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    # 3. Sharpen — boost edges without altering stroke geometry
    kernel = np.array([
        [ 0, -1,  0],
        [-1,  5, -1],
        [ 0, -1,  0],
    ], dtype=np.float32)
    sharpened = cv2.filter2D(enhanced, -1, kernel)

    return sharpened


def _run_paddle_ocr(img: Image.Image) -> str:
    """
    Run PaddleOCR on a PIL Image and return concatenated text.

    PaddleOCR returns a list of pages, each containing a list of
    (bounding_box, (text, confidence)) tuples.  We concatenate all
    recognised text fragments.
    """
    import numpy as np

    ocr = get_paddle_ocr()
    img_array = np.array(img)
    img_array = _preprocess_manga_image(img_array)
    results = ocr.ocr(img_array, cls=True)  # type: ignore[union-attr]

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

    return " ".join(lines)


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
    log.info("OCR request received")
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type and file is not None:
        # ── multipart upload path ─────────────────────────────
        try:
            raw = await file.read()
            img = Image.open(io.BytesIO(raw)).convert("RGB")
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
        if not image_b64:
            return JSONResponse(
                status_code=400,
                content={"error": "Missing 'image' field in JSON body"},
            )
        try:
            img = _decode_base64_image(image_b64)
        except Exception as exc:
            return JSONResponse(
                status_code=400,
                content={"error": f"Invalid base64 image: {exc}"},
            )

    try:
        text = _run_paddle_ocr(img)
        return {"text": text}
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
        img = Image.open(io.BytesIO(raw)).convert("RGB")

        log.info("OCR debug request received")

        text = _run_paddle_ocr(img)

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

    try:
        result = _translate_opus(text)
        return {"translatedText": result}
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
