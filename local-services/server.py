# Mekai Local Services — Companion Server
#
# Provides two optional local upgrades that the Mekai React frontend
# auto-detects at runtime:
#
#   1. **manga-ocr**      — state-of-the-art Japanese manga OCR
#   2. **LibreTranslate**  — offline Japanese → English translation
#
# ## Quick start
#
#   cd local-services
#   pip install -r requirements.txt
#   python server.py
#
# The server listens on http://localhost:5100.  When the frontend
# detects it, OCR quality and translation quality both improve
# automatically with zero config changes.
#
# ## Architecture
#
# ```
# ┌─────────────────────────┐         ┌──────────────────────┐
# │  React frontend (Vite)  │──POST──▶│  local-services/     │
# │  localhost:5173          │         │  server.py :5100     │
# └─────────────────────────┘         │    ├─ /ocr           │
#                                      │    ├─ /ocr/health    │
#                                      │    ├─ /translate     │
#                                      │    └─ /translate/... │
#                                      └──────────────────────┘
# ```
#
# ## Requirements
#
# - Python 3.10+
# - ~2 GB disk for manga-ocr model (one-time download)
# - ~1 GB disk for Argos Translate ja→en model
#
# On Vercel production these endpoints are unreachable so the app
# silently falls back to Tesseract.js + MyMemory with no errors.

import argparse
import base64
import io
import os
import sys
from typing import Optional

try:
    from flask import Flask, request, jsonify
    from flask_cors import CORS
except ImportError:
    print("ERROR: Flask and flask-cors are required.")
    print("  pip install flask flask-cors")
    sys.exit(1)

app = Flask(__name__)

# ─── CORS ─────────────────────────────────────────────────────
# Allow only localhost dev origins by default.  Override via the
# MEKAI_ALLOWED_ORIGINS env var (comma-separated list of origins).
_env_origins = os.environ.get("MEKAI_ALLOWED_ORIGINS", "")
if _env_origins:
    _allowed_origins = [o.strip() for o in _env_origins.split(",") if o.strip()]
else:
    _allowed_origins = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
    ]
CORS(app, origins=_allowed_origins)

# ─── Lazy-loaded models ──────────────────────────────────────

_manga_ocr_model: Optional[object] = None
_argos_translator: Optional[object] = None

# OPUS-MT (MarianMT) model and tokenizer — lazy-loaded
_opus_tokenizer: Optional[object] = None
_opus_model: Optional[object] = None

# Name of the HuggingFace model used for OPUS-MT translation
_OPUS_MODEL_NAME = "Helsinki-NLP/opus-mt-ja-en"


def get_manga_ocr():
    """Load manga-ocr model on first call (caches in memory)."""
    global _manga_ocr_model
    if _manga_ocr_model is None:
        try:
            from manga_ocr import MangaOcr
            print("[mekai] Loading manga-ocr model (first time may download ~400 MB)...")
            _manga_ocr_model = MangaOcr()
            print("[mekai] manga-ocr ready.")
        except ImportError:
            raise RuntimeError(
                "manga-ocr is not installed.  pip install manga-ocr"
            )
    return _manga_ocr_model


def get_argos_translator():
    """
    Return the cached Argos ja→en translator.

    Does NOT download or install anything — that must be done once by
    running ``python server.py --install-argos``.
    Raises RuntimeError (caught by the health endpoint → 503) if the
    model is not yet installed.
    """
    global _argos_translator
    if _argos_translator is None:
        try:
            import argostranslate.translate
        except ImportError:
            raise RuntimeError(
                "argostranslate is not installed.  Run: pip install argostranslate"
            )

        langs = argostranslate.translate.get_installed_languages()
        src = next((l for l in langs if l.code == "ja"), None)
        tgt = next((l for l in langs if l.code == "en"), None)
        if src is None or tgt is None:
            raise RuntimeError(
                "Argos ja→en model is not installed. "
                "Run once: python server.py --install-argos"
            )
        translator = src.get_translation(tgt)
        if translator is None:
            raise RuntimeError(
                "Argos ja→en translation pair missing after install. "
                "Run: python server.py --install-argos"
            )
        _argos_translator = translator
        print("[mekai] Argos ja→en ready.")
    return _argos_translator


def get_opus_translator():
    """
    Return the cached OPUS-MT (MarianMT) ja→en tokenizer and model tuple.

    Loads from the local HuggingFace cache.  Does NOT download — run
    ``python server.py --install-translate`` for the one-time download.
    Raises RuntimeError (→ 503) if not cached.
    """
    global _opus_tokenizer, _opus_model
    if _opus_tokenizer is None or _opus_model is None:
        try:
            from transformers import MarianMTModel, MarianTokenizer
        except ImportError:
            raise RuntimeError(
                "transformers is not installed.  Run: pip install transformers sentencepiece"
            )
        try:
            _opus_tokenizer = MarianTokenizer.from_pretrained(
                _OPUS_MODEL_NAME, local_files_only=True
            )
            _opus_model = MarianMTModel.from_pretrained(
                _OPUS_MODEL_NAME, local_files_only=True
            )
            print(f"[mekai] OPUS-MT ({_OPUS_MODEL_NAME}) ready.")
        except Exception:
            raise RuntimeError(
                f"OPUS-MT model '{_OPUS_MODEL_NAME}' is not cached locally. "
                "Run once: python server.py --install-translate"
            )
    return _opus_tokenizer, _opus_model


def _translate_with_opus(text: str) -> str:
    """Translate *text* from Japanese to English using the cached OPUS-MT model."""
    tokenizer, model = get_opus_translator()
    import torch
    inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True, max_length=512)
    with torch.no_grad():
        output = model.generate(**inputs)
    return tokenizer.decode(output[0], skip_special_tokens=True)


def get_best_translator():
    """
    Return a callable (text: str) -> str that translates ja→en,
    using whichever provider is installed, in priority order:
      1. Argos Translate (lightweight)
      2. OPUS-MT MarianMT (higher quality)

    Raises RuntimeError with install instructions if neither is available.
    """
    errors = []

    # 1. Try Argos
    try:
        argos = get_argos_translator()
        return lambda text: argos.translate(text)
    except RuntimeError as e:
        errors.append(f"Argos: {e}")

    # 2. Try OPUS-MT
    try:
        get_opus_translator()  # validates the cache
        return _translate_with_opus
    except RuntimeError as e:
        errors.append(f"OPUS-MT: {e}")

    raise RuntimeError(
        "No local translator is installed. Install one of:\n"
        "  • OPUS-MT (recommended): python server.py --install-translate\n"
        "  • Argos Translate:       python server.py --install-argos\n"
        "Details: " + " | ".join(errors)
    )


def install_argos_ja_en() -> None:
    """One-time download and install of the Argos Translate ja→en package."""
    try:
        import argostranslate.package
    except ImportError:
        print("ERROR: argostranslate is not installed.  Run: pip install argostranslate")
        sys.exit(1)

    print("[mekai] Updating Argos package index...")
    argostranslate.package.update_package_index()
    available = argostranslate.package.get_available_packages()
    ja_en = next(
        (p for p in available if p.from_code == "ja" and p.to_code == "en"),
        None,
    )
    if ja_en is None:
        print("ERROR: Argos Translate ja→en package not found in the online index.")
        sys.exit(1)
    print("[mekai] Downloading and installing ja→en model (~100 MB). Please wait...")
    ja_en.install()
    print("[mekai] Argos ja→en installed successfully. You can now start the server.")


def install_opus_ja_en() -> None:
    """One-time download and cache of the OPUS-MT Helsinki-NLP/opus-mt-ja-en model."""
    try:
        from transformers import MarianMTModel, MarianTokenizer
    except ImportError:
        print("ERROR: transformers is not installed.  Run: pip install transformers sentencepiece")
        sys.exit(1)

    print(f"[mekai] Downloading OPUS-MT model '{_OPUS_MODEL_NAME}' (~300 MB). Please wait...")
    # Download both tokenizer and model (cached in ~/.cache/huggingface/)
    MarianTokenizer.from_pretrained(_OPUS_MODEL_NAME)
    MarianMTModel.from_pretrained(_OPUS_MODEL_NAME)
    print("[mekai] OPUS-MT model cached successfully. You can now start the server.")


# ─── Health endpoints ─────────────────────────────────────────


@app.route("/ocr/health", methods=["GET"])
def ocr_health():
    """Probe endpoint — returns 200 if manga-ocr can be loaded."""
    try:
        get_manga_ocr()
        return jsonify({"status": "ok"})
    except Exception as exc:
        return jsonify({"status": "unavailable", "error": str(exc)}), 503


@app.route("/translate/health", methods=["GET"])
def translate_health():
    """Probe endpoint — returns 200 when any local translator is ready."""
    try:
        get_best_translator()
        return jsonify({"status": "ok"})
    except Exception as exc:
        return jsonify(
            {
                "status": "unavailable",
                "error": str(exc),
                "hint": "Run: python server.py --install-translate",
            }
        ), 503


# ─── OCR endpoint ─────────────────────────────────────────────


@app.route("/ocr", methods=["POST"])
def ocr():
    """
    Accepts either:
      • JSON body: { "image": "<base64 data-url or raw base64>" }
      • multipart/form-data with a field named ``file`` (avoids base64 overhead)
    Returns JSON: { "text": "recognised Japanese text" }
    """
    from PIL import Image

    content_type = request.content_type or ""
    if content_type.startswith("multipart/form-data"):
        # ── multipart path ───────────────────────────────────────
        uploaded = request.files.get("file")
        if uploaded is None:
            return jsonify({"error": "No 'file' field in multipart request"}), 400
        try:
            img = Image.open(uploaded.stream).convert("RGB")
        except Exception as exc:
            return jsonify({"error": f"Invalid image: {exc}"}), 400
    else:
        # ── JSON / raw base64 path ───────────────────────────────
        body = request.get_json(force=True)
        image_b64: str = body.get("image", "")
        # Strip optional data-URL prefix (data:image/png;base64,<data>)
        if "," in image_b64:
            image_b64 = image_b64.split(",", 1)[1]
        try:
            img_bytes = base64.b64decode(image_b64)
            img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        except Exception as exc:
            return jsonify({"error": f"Invalid image: {exc}"}), 400

    try:
        model = get_manga_ocr()
        text = model(img)  # type: ignore[operator]
        return jsonify({"text": text})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─── Translation endpoint ────────────────────────────────────


@app.route("/translate", methods=["POST"])
def translate():
    """
    Accepts JSON: { "q": "日本語テキスト", "source": "ja", "target": "en" }
    Returns JSON: { "translatedText": "English text" }
    """
    body = request.get_json(force=True)
    text: str = body.get("q", "").strip()
    if not text:
        return jsonify({"translatedText": ""})

    try:
        translate_fn = get_best_translator()
        result = translate_fn(text)
        return jsonify({"translatedText": result})
    except Exception as exc:
        return jsonify({"error": str(exc)}), 500


# ─── Main ─────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Mekai local companion server")
    parser.add_argument("--port", type=int, default=5100, help="Port (default 5100)")
    parser.add_argument("--host", default="127.0.0.1", help="Bind address")
    parser.add_argument(
        "--install-argos",
        action="store_true",
        help="One-time install of the Argos Translate ja→en model, then exit.",
    )
    parser.add_argument(
        "--install-translate",
        action="store_true",
        help="One-time download of the OPUS-MT ja→en model (recommended), then exit.",
    )
    args = parser.parse_args()

    if args.install_argos:
        install_argos_ja_en()
        sys.exit(0)

    if args.install_translate:
        install_opus_ja_en()
        sys.exit(0)

    print(f"[mekai] Starting local services on http://{args.host}:{args.port}")
    print("[mekai] Allowed CORS origins:", _allowed_origins)
    print("[mekai] Endpoints:")
    print("  GET  /ocr/health        — check manga-ocr availability")
    print("  POST /ocr               — run manga-ocr on an image (JSON or multipart)")
    print("  GET  /translate/health   — check translation availability")
    print("  POST /translate          — translate ja→en")
    print()
    print("[mekai] Tips:")
    print("  Install OPUS-MT model (recommended): python server.py --install-translate")
    print("  Install Argos Translate model:        python server.py --install-argos")
    print()

    app.run(host=args.host, port=args.port, debug=False)
