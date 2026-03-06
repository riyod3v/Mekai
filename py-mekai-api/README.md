# Mekai — Local Services (Presentation Mode)

Optional companion server that upgrades Mekai's OCR and translation
quality when running locally. Perfect for demos and development.

> **Python 3.11 or 3.12 required.** Python 3.13+ breaks several NLP
> dependencies (manga-ocr, argostranslate). Use `uv` to pin the version.

## What it provides

| Service | Technology | Improvement over default |
|---------|-----------|------------------------|
| **OCR** | [manga-ocr](https://github.com/kha-white/manga-ocr) | Purpose-built for Japanese manga — far more accurate than browser Tesseract.js |
| **Translation** | [OPUS-MT ja→en](https://huggingface.co/Helsinki-NLP/opus-mt-ja-en) (preferred) or [Argos Translate](https://github.com/argosopentech/argos-translate) | Offline neural MT — higher quality than MyMemory for manga phrases |

---

## Quick start (Windows, VS Code)

### 1 — Install uv (once per machine)

Open a PowerShell terminal:

```powershell
winget install --id=astral-sh.uv -e
# restart the terminal so uv is on PATH
```

Or if you already have Python:

```powershell
pip install uv
```

### 2 — Create a virtualenv pinned to Python 3.11

```powershell
cd py-mekai-api

# Download Python 3.11 (skipped if already present):
uv python install 3.11

# Create .venv using Python 3.11:
uv venv --python 3.11 .venv

# Activate (PowerShell):
.venv\Scripts\Activate.ps1
```

> If PowerShell blocks scripts, run once:
> `Set-ExecutionPolicy RemoteSigned -Scope CurrentUser`

### 3 — Install torch (CPU-only, much smaller than CUDA build)

```powershell
uv pip install torch --index-url https://download.pytorch.org/whl/cpu
```

### 4 — Install all other dependencies

```powershell
uv pip install -r requirements.txt
```

### 5 — Download the translation model (one-time, ~300 MB)

OPUS-MT (recommended — higher quality):

```powershell
python server.py --install-translate
```

This caches `Helsinki-NLP/opus-mt-ja-en` in `~/.cache/huggingface/`.
Run only once; subsequent server starts use the cache instantly.

Or for the lightweight Argos Translate ja→en model (~100 MB):

```powershell
python server.py --install-argos
```

### 6 — Start the server

```powershell
python server.py
```

The server starts on **http://localhost:5100**. The Mekai React
frontend detects it automatically — no `.env` changes needed.

---

## How it works

```
┌─────────────────────────┐         ┌──────────────────────────┐
│  React app (Vite)       │──POST──▶│  server.py :5100         │
│  localhost:5173          │         │    /ocr          manga-ocr│
│                          │◀─JSON──│    /translate    OPUS-MT  │
└─────────────────────────┘         └──────────────────────────┘
```

- On startup the frontend probes `/ocr/health` and `/translate/health`.
- If available → uses manga-ocr for OCR and OPUS-MT for translation.
- If unavailable or 503 → OCR and translation are not available (no browser fallbacks).
- On Vercel production, set `VITE_MEKAI_API_URL` to the hosted server URL
  (e.g. Railway) so the deployed app can reach the API.

---

## Translation provider priority

The server tries providers in this order:

1. **Argos Translate** — if the ja→en package is installed
2. **OPUS-MT (MarianMT)** — if `Helsinki-NLP/opus-mt-ja-en` is in the HuggingFace cache
3. → **503** — frontend shows an error (no browser fallbacks)

---

## Endpoints reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/ocr/health` | 200 when manga-ocr model is loaded |
| POST | `/ocr` | JSON `{ "image": "<base64>" }` or multipart `file` field |
| GET | `/translate/health` | 200 when a translator is ready, 503 with instructions otherwise |
| POST | `/translate` | JSON `{ "q": "...", "source": "ja", "target": "en" }` → `{ "translatedText": "..." }` |

---

## Custom port

```powershell
python server.py --port 5200
```

Then add to your `.env.local`:

```
VITE_MEKAI_API_URL=http://localhost:5200
```

---

## CORS

By default the server allows only `localhost:5173` and `localhost:5174`.
Override with an environment variable:

```powershell
$env:MEKAI_ALLOWED_ORIGINS = "http://localhost:5173,http://localhost:3000"
python server.py
```

---

## Running only OCR (skip translation)

Comment out the translation sections in `requirements.txt`, then:

```powershell
uv pip install -r requirements.txt
python server.py   # /translate/health returns 503, frontend shows translation unavailable
```

---

## Disk space summary

| Component | Approx size |
|-----------|-------------|
| manga-ocr model | ~400 MB (HuggingFace cache) |
| OPUS-MT ja→en | ~300 MB (HuggingFace cache) |
| Argos Translate ja→en | ~100 MB |
| torch CPU wheel | ~200 MB |
