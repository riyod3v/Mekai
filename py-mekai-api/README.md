# Mekai API — Lightweight PaddleOCR Backend

Manga OCR + translation microservice for the Mekai platform.
Designed to run within **Railway's 500 MB RAM limit** using CPU-only
PaddlePaddle + PaddleOCR instead of the heavier PyTorch/manga-ocr stack.

> **Python 3.10 – 3.12 required.** Python 3.13+ may break some dependencies.

## What it provides

| Service | Technology | Notes |
|---------|-----------|-------|
| **OCR** | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) (lang=japan) | CPU-only, ~90 MB wheel + ~80 MB models |
| **Translation** | [OPUS-MT](https://huggingface.co/Helsinki-NLP/opus-mt-ja-en) (MarianMT) ja→en | ~300 MB model via HuggingFace transformers |

---

## Quick start (x86_64 — Windows / Linux / macOS Intel)

### 1 — Create a virtualenv

```bash
cd py-mekai-api

# Using uv (recommended):
uv python install 3.11
uv venv --python 3.11 .venv

# Activate:
# Linux/macOS:
source .venv/bin/activate
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# or
.venv\Scripts\activate
```

### 2 — Install dependencies

```bash
uv pip install -r requirements.txt
```

### 3 — Install PyTorch CPU-only (required for translation)

```bash
uv pip install torch --index-url https://download.pytorch.org/whl/cpu
```

This installs the CPU-only build (~200 MB instead of ~2.5 GB with CUDA).

### 4 — Install setuptools (required for PaddleOCR)

```bash
uv pip install setuptools
```

### 5 — Download PaddleOCR models (200 MB total, one-time)

```bash
uv run python main.py --install-ocr
```

### 6 — Download the OPUS-MT ja→en model (one-time, ~300 MB)

```bash
uv run python main.py --install-translate
```

Models auto-download on first OCR request if you skip this step.

### 7 — Start the server

```bash
uv run python main.py
```

Server starts on **http://localhost:5100**. The Mekai frontend detects it
automatically — no `.env` changes needed for local dev.

---

## ARM64 / Apple Silicon / aarch64 workarounds

PaddlePaddle does **not** publish official `aarch64` wheels on PyPI.
Here are your options for local development on ARM64:

### Option A — Build from source (most reliable)

```bash
# Install build deps
pip install numpy protobuf

# Clone and build PaddlePaddle from source
git clone https://github.com/PaddlePaddle/Paddle.git
cd Paddle
mkdir build && cd build
cmake .. -DWITH_GPU=OFF -DWITH_TESTING=OFF -DPY_VERSION=3.11
make -j$(nproc)
pip install python/dist/paddlepaddle-*.whl
```

### Option B — Use Docker (easiest)

Run the x86 image under Docker with emulation:

```bash
docker build -t mekai-api .
docker run -p 5100:5100 mekai-api
```

On Apple Silicon, Docker Desktop automatically uses Rosetta/qemu for
x86 images. Performance will be slower but functional for dev.

### Option C — Use a pre-built community wheel

Check https://www.paddlepaddle.org.cn/install/quick for any ARM64
nightly builds, or search for community-maintained aarch64 wheels:

```bash
pip install paddlepaddle -f https://www.paddlepaddle.org.cn/whl/linux/cpu-mkl/avx/stable.html
```

### Option D — Skip local OCR, develop frontend-only

Point the frontend at a remote/staging Railway deployment:

```
# .env.local
VITE_OCR_API_URL=https://mekai-production.up.railway.app
```

---

## How it works

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  React app (Vite)       │──POST──▶│  main.py :5100           │
│  localhost:5173          │         │    /ocr       PaddleOCR  │
│                          │◀─JSON──│    /translate  OPUS-MT    │
└─────────────────────────┘         └──────────────────────────┘
```

- Frontend probes `/ocr/health` and `/translate/health` on startup.
- If available → uses PaddleOCR for recognition and OPUS-MT for translation.
- If unavailable → shows error (no browser-side fallbacks).
- In production, set `VITE_OCR_API_URL` to the Railway deployment URL (already set in `.env`).

---

## Endpoints reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Root health check |
| GET | `/ocr/health` | 200 when PaddleOCR is loaded |
| POST | `/ocr` | JSON `{ "image": "<base64>" }` or multipart `file` → `{ "text": "..." }` |
| GET | `/translate/health` | 200 when OPUS-MT ja→en is ready |
| POST | `/translate` | `{ "q": "...", "source": "ja", "target": "en" }` → `{ "translatedText": "..." }` |

---

## Railway deployment

Railway auto-detects the `Dockerfile`. The image:

1. Installs **CPU-only PyTorch** first (~200 MB vs ~2.5 GB with CUDA)
2. Installs CPU-only PaddlePaddle + PaddleOCR (~170 MB)
3. Installs transformers + sentencepiece for OPUS-MT
4. Pre-downloads OCR models (~80 MB)
5. Pre-downloads OPUS-MT ja→en model (~300 MB)
6. Runs Uvicorn with 1 worker

> Docker image size: ~3–3.5 GB (fits within Railway's 4 GB limit).

Railway also reads `railway.json` for deploy config. The `PORT` env
var is injected automatically.

Alternatively, if not using Docker, Railway can use the `Procfile`:

```
web: uvicorn main:app --host 0.0.0.0 --port ${PORT:-5100} --workers 1 --log-level info
```

---

## Custom port

```bash
python main.py --port 5200
```

Then in `.env.local`:

```
VITE_LOCAL_API_URL=http://localhost:5200
```

---

## CORS

Default allowed origins: `localhost:5173`, `localhost:5174`, `mekaiscans.vercel.app`.

Override via environment variable:

```bash
export MEKAI_ALLOWED_ORIGINS="http://localhost:5173,https://your-app.vercel.app"
python main.py
```

---

## Memory footprint comparison

| Component | Old (manga-ocr) | New (PaddleOCR + OPUS-MT) |
|-----------|-----------------|---------------------------|
| ML framework | PyTorch full (~2.5 GB disk) | PaddlePaddle (~90 MB) + PyTorch CPU-only (~200 MB) |
| OCR model | manga-ocr (~400 MB disk) | PaddleOCR japan (~80 MB disk) |
| Translation | manga-ocr (same model) | OPUS-MT (~300 MB disk) |
| **Docker image** | **~7+ GB** | **~3–3.5 GB** (within Railway 4 GB limit) |
| **Total RSS** | **~600–800 MB** (OOM on Railway) | **~400–500 MB** |

> **Known issue:** PyTorch is still required for OPUS-MT translation.
> A future improvement could swap to a lighter translation engine
> (e.g. CTranslate2 or Argos Translate) to eliminate the PyTorch dependency.
