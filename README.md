# Mekai — OCR-Assisted Manga Reading Platform

A production-grade web application for reading untranslated manga scans with user-controlled OCR selection, translation overlays, shared manga libraries, and a persistent Word Vault.

Built with React 19 + Vite 7 + TypeScript + Tailwind CSS v4 + Supabase (Auth · Postgres · Storage · Realtime) and an external Python OCR microservice.

> **Railway Free Tier:** The Python OCR/translation API runs on Railway's Free Tier with a **strict 512 MB RAM limit**. All backend dependencies (PaddleOCR, OPUS-MT, FastAPI) are tuned for this constraint. See [Deployment](#deployment) for details.

---

## Core Architecture

```
Browser (React SPA — Vite)
        |
        v
Supabase Backend
(Auth · Postgres · Storage · Realtime)
        |
        v
Python OCR/Translation API (FastAPI)
(PaddleOCR + OPUS-MT — Railway)
```

| Layer | Responsibility |
|-------|---------------|
| **Frontend** | Selection UI, overlays, Word Vault, reading modes |
| **Supabase** | Storage, database, auth, realtime subscriptions |
| **Python API** | OCR (PaddleOCR) + translation (OPUS-MT ja-en) |

---

## OCR Processing Pipeline

Unlike typical manga readers that OCR the entire page, Mekai performs **selective OCR** on user-selected regions.

### Step-by-step flow

1. User selects a speech bubble using the `OCRSelectionLayer`.
2. The browser crops the selected region using HTML Canvas.
3. An ink pre-flight check (`hasInkContent`) rejects empty/blank selections.
4. The cropped image is encoded as base64.
5. The base64 image is sent to the Python OCR API:

```json
POST /ocr
{
  "image": "<base64-data>"
}
```

6. The OCR service (PaddleOCR):
   - Decodes the image
   - Auto-detects inverted (dark) panels and adjusts
   - Detects Japanese text regions within the bubble
   - Runs recognition and returns extracted text

```json
{
  "text": "Japanese text here"
}
```

7. The frontend sends the extracted text to the translation endpoint:

```json
POST /translate
{
  "q": "Japanese text",
  "source": "ja",
  "target": "en"
}
```

8. The translated + romaji text is rendered as a speech bubble overlay via `TranslationOverlay`.
9. Results are saved to `translation_history` (private) and optionally to `chapter_translations` (published, if user is a translator).

---

## Why OCR Runs Outside Vercel

Large OCR/translation models cannot run inside Vercel serverless functions:

- Cold start restrictions and execution time limits
- Memory limits too low for PaddleOCR + OPUS-MT
- Model size exceeds serverless packaging limits

Mekai uses a dedicated **Python FastAPI microservice** deployed on [Railway](https://railway.app).

---

## Project Structure

```
mekai/
|-- index.html
|-- vite.config.ts
|-- package.json
|-- vercel.json
|-- tsconfig.json
|
|-- src/
|   |-- main.tsx                         <- React root mount
|   |-- App.tsx                          <- Router, QueryClient, Auth
|   |-- index.css                        <- Tailwind directives + globals
|   |
|   |-- assets/IMG/                      <- SVG logos + PNG icons
|   |   |-- branding/
|   |   +-- icons/
|   |
|   |-- context/
|   |   |-- NotificationContext.tsx       <- Toast notification provider
|   |   +-- ThemeContext.tsx              <- Dark/light theme
|   |
|   |-- hooks/
|   |   |-- useAuth.ts                   <- Supabase session watcher
|   |   |-- useRealtimeManga.ts          <- Supabase realtime subscription
|   |   |-- useRole.ts                   <- Profile role (reader / translator)
|   |   |-- useTheme.ts                  <- Theme toggle helper
|   |   +-- useTranslationHistory.ts     <- TanStack Query wrappers
|   |
|   |-- lib/
|   |   |-- api/
|   |   |   +-- manga-ocr-py-API.ts      <- HTTP client for py-mekai-api
|   |   |-- ocr/
|   |   |   +-- ocr.ts                   <- Canvas crop, ink check, preprocessing
|   |   |-- supabase/
|   |   |   |-- client.ts               <- Single Supabase createClient()
|   |   |   +-- index.ts                <- Barrel re-export
|   |   |-- translate/
|   |   |   |-- romaji.ts               <- toRomaji() helper (wanakana)
|   |   |   +-- translate.ts            <- translateJapaneseToEnglish()
|   |   +-- utils/
|   |       |-- browserAPI.ts            <- ocrAndTranslate() orchestrator
|   |       |-- dateUtils.ts             <- Date formatting
|   |       |-- logger.ts               <- Logging utility
|   |       +-- redirectUtils.ts         <- Post-auth redirect helpers
|   |
|   |-- services/                        <- All Supabase DB access
|   |   |-- chapters.ts
|   |   |-- chapterTranslations.ts
|   |   |-- manga.ts
|   |   |-- profiles.ts
|   |   |-- readingProgress.ts
|   |   |-- storageCovers.ts
|   |   |-- translationHistory.ts
|   |   +-- wordVault.ts
|   |
|   |-- types/
|   |   +-- index.ts                     <- Shared types + regionHash()
|   |
|   +-- ui/
|       |-- components/
|       |   |-- ChapterUploadForm.tsx
|       |   |-- Drawer.tsx
|       |   |-- EmptyState.tsx
|       |   |-- ErrorState.tsx
|       |   |-- HistoryPanel.tsx
|       |   |-- LoadingSpinner.tsx
|       |   |-- MangaCard.tsx
|       |   |-- MangaUploadForm.tsx
|       |   |-- Modal.tsx
|       |   |-- Navbar.tsx
|       |   |-- OCRSelectionLayer.tsx     <- Mouse drag-select on page image
|       |   |-- ProfileDropdown.tsx
|       |   |-- ProtectedRoute.tsx
|       |   |-- StatusBar.tsx
|       |   +-- TranslationOverlay.tsx    <- In-bubble fitted-text overlay
|       +-- pages/
|           |-- AuthPage.tsx
|           |-- LandingPage.tsx
|           |-- MangaEntryPage.tsx
|           |-- MangaReaderPage.tsx       <- Primary reader (OCR, overlays, CBZ)
|           |-- ProfileSettings.tsx
|           |-- ReaderDashboard.tsx
|           |-- TranslatorDashboard.tsx
|           +-- WordVaultPage.tsx
|
+-- py-mekai-api/                        <- Python OCR/translation microservice
    |-- main.py                          <- FastAPI server (PaddleOCR + OPUS-MT)
    |-- Dockerfile                       <- Railway deployment image
    |-- railwayReq.txt                   <- Railway deployment deps
    |-- localReq.txt                     <- Local development deps (all-in-one)
    |-- railway.json
    |-- nixpacks.toml
    |-- Procfile
    +-- README.md
```

---

## Features at a Glance

| Feature | Description |
|---|---|
| Role-based authentication | Sign up as Reader or Translator; role stored in `profiles` |
| Shared Manga Library | Translators upload manga and chapters; Readers browse instantly |
| Private Reader Uploads | Readers upload personal `.cbz` files (isolated and private) |
| Realtime synchronization | Dashboards auto-update via Supabase Realtime subscriptions |
| Selective OCR | Draw bounding box on a speech bubble; OCR runs only on that region |
| Translation pipeline | OPUS-MT ja-en via `py-mekai-api`; provider-swappable architecture |
| Translation Replay | Previously translated regions are stored and toggled without re-running OCR |
| Reading progress tracking | Resume from last-read page per chapter |
| Word Vault | Save original + translated text with optional romaji; searchable and deletable |
| Dual reading modes | Page-by-page mode and Vertical Scroll mode |
| OCR preprocessing | Ink pre-flight check, auto-inversion of dark panels, contrast adjustment |

---

## OCR Service (Python)

The OCR microservice is a standalone FastAPI application in `py-mekai-api/`.

| Service | Technology | Notes |
|---------|-----------|-------|
| **OCR** | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) (lang=japan) | CPU-only, ~90 MB wheel + ~80 MB models |
| **Translation** | [OPUS-MT](https://huggingface.co/Helsinki-NLP/opus-mt-ja-en) (MarianMT) ja-en | ~300 MB model via HuggingFace transformers |

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/` | Root health check |
| GET | `/ocr/health` | OCR readiness probe |
| POST | `/ocr` | `{ "image": "<base64>" }` or multipart `file` -> `{ "text": "..." }` |
| GET | `/translate/health` | Translation readiness probe |
| POST | `/translate` | `{ "q": "...", "source": "ja", "target": "en" }` -> `{ "translatedText": "..." }` |

> See [`py-mekai-api/README.md`](py-mekai-api/README.md) for setup, ARM64 workarounds, and deployment details.

---

## Environment Variables

### Frontend (Vite)

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_RAILWAY_SERVER_URL` | Python OCR service URL (production Railway URL) |
| `VITE_LOCAL_API_URL` | Local development API URL (default: `http://localhost:5100`) |

### Python API (Railway)

| Variable | Purpose |
|----------|---------|
| `PORT` | Injected by Railway automatically |
| `MEKAI_ALLOWED_ORIGINS` | Comma-separated CORS origins (defaults to localhost for dev) |

---

## Deployment

### Frontend — Vercel

The React SPA is deployed to [Vercel](https://vercel.com). Configuration is in `vercel.json`.

```bash
npm run build     # Output in dist/
```

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_RAILWAY_SERVER_URL` as environment variables on Vercel.

### Python API — Railway (Free Tier)

> **Memory Constraint:** Railway's Free Tier enforces a **strict 512 MB RAM limit**. The entire OCR + translation stack (PaddleOCR, OPUS-MT, FastAPI, PyTorch CPU) must fit within this budget. The codebase is specifically optimized for this:
>
> - CPU threads pinned to 2 on Railway to reduce memory contention
> - OCR requests serialized via semaphore (one at a time) to prevent OOM
> - Translation model loaded lazily on first request to reduce cold-start RAM
> - Image input capped at 512px max dimension
> - Single Uvicorn worker (no multi-process)
> - CPU-only PyTorch (~200 MB vs ~2.5 GB with CUDA)

Railway auto-detects the `Dockerfile` in `py-mekai-api/`. The image:

1. Installs CPU-only PyTorch (~200 MB)
2. Installs CPU-only PaddlePaddle + PaddleOCR (~170 MB)
3. Installs transformers + sentencepiece for OPUS-MT
4. Pre-downloads OCR models (~80 MB)
5. Pre-downloads OPUS-MT ja-en model (~300 MB)
6. Runs Uvicorn with 1 worker

Docker image size: ~3-3.5 GB (fits within Railway's 4 GB limit).

---

## Running Locally

### 1 — Set up environment variables

```bash
cp .env .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_LOCAL_API_URL=http://localhost:5100
VITE_RAILWAY_SERVER_URL=https://mekai-production.up.railway.app
```

Find Supabase values in **Supabase Dashboard > Project Settings > API**.

### 2 — Set up Supabase

1. Open **Supabase Dashboard > SQL Editor**.
2. Run your schema SQL (profiles, manga, chapters, translation_history, chapter_translations, word_vault, reading_progress, and RLS policies).
3. Enable Realtime on `manga` and `chapters` tables.
4. Create and policy-protect the `covers` and `pages` storage buckets.

### 3 — Install dependencies and start the frontend

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`.

### 4 — Start the Python OCR/translation API

See [`py-mekai-api/README.md`](py-mekai-api/README.md) for full setup instructions. Quick start:

```bash
cd py-mekai-api
uv venv --python 3.11 .venv

# Activate:
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# Linux/macOS:
# source .venv/bin/activate

uv pip install -r localReq.txt

python main.py --install-ocr
python main.py --install-translate
python main.py
```

Server starts on `http://localhost:5100`. The frontend detects it automatically.

---

## Role Flows

### Reader Flow

```
/auth -> Sign up as Reader
  |
/reader -> Shared Library (live via Realtime)
           My Private Uploads (isolated)
  |
/manga/:id -> Metadata + chapter list
  |
/read/:chapterId ->
  - Toggle Page-by-page / Vertical Scroll
  - Activate OCR -> draw bounding box
  -> Region cropped via Canvas
  -> Ink pre-flight check
  -> OCR runs only on selection (PaddleOCR)
  -> Translation overlay displayed (OPUS-MT)
  -> Option to save to Word Vault
  - Toggle previously translated overlays
  - Resume from last saved reading position
  |
/word-vault -> Search, browse, delete saved entries
```

### Translator Flow

```
/auth -> Sign up as Translator
  |
/translator -> Create shared manga
              Upload and update chapters
              Images auto-sorted by filename
              Readers see updates instantly (Realtime)
  |
/manga/:id -> Manage chapters (own manga only)
              OCR translations published to chapter_translations
```

---

## Supabase Configuration

| Table | Access |
|---|---|
| `profiles` | Public read; self write |
| `manga` | Shared: all authenticated users; Private: owner only |
| `chapters` | Accessible if parent manga is accessible; uploader can modify |
| `translation_history` | Owner-only (`user_id`) |
| `chapter_translations` | Translators write; readers read |
| `word_vault` | Owner-only (`user_id`) |
| `reading_progress` | Owner-only (`user_id`) |

Realtime is enabled on `manga` and `chapters` tables.

### Storage Upload Path Rules

All uploads use the uploader `user.id` as the first path segment so delete policies can verify ownership without a DB lookup.

| Bucket | Path Pattern | Example |
|---|---|---|
| `covers` | `{uid}/manga/{mangaId}/cover.{ext}` | `abc123/manga/def456/cover.png` |
| `pages` | `{uid}/manga/{mangaId}/chapters/{chapterId}/{pageNumber}.{ext}` | `abc123/manga/def456/chapters/ghi789/1.jpg` |

---

## Tech Stack

| Layer | Library |
|---|---|
| UI Framework | React 19 + TypeScript |
| Build Tool | Vite 7 |
| Styling | Tailwind CSS v4 |
| Router | React Router v7 |
| Data Fetching | TanStack Query v5 |
| Backend | Supabase (Auth + Postgres + Storage + Realtime) |
| OCR | PaddleOCR (CPU-only, via py-mekai-api) |
| Translation | OPUS-MT ja-en (Helsinki-NLP, via py-mekai-api) |
| Icons | Lucide React |
| Toasts | react-hot-toast |
| Archive Support | JSZip (CBZ extraction in browser) |

---

## What Changed (Recent Refactors)

The following systems were **intentionally removed** and must **not** be reintroduced:

| System | Reason for Removal |
|---|---|
| Tesseract.js (browser OCR) | Poor accuracy for manga; heavy bundle size |
| Apify OCR actor | API limitations and reliability issues |
| MyMemory translation | Unreliable, API rate limits |
| manga-ocr (PyTorch) | ~444 MB model; replaced by PaddleOCR (~170 MB) for Railway 512 MB RAM fit |
| Flask server | Replaced by FastAPI for async support and better performance |

---

## Build for Production

```bash
npm run build
```

Output is in `dist/`. Deploy to Vercel (recommended), Netlify, Cloudflare Pages, or any static host.

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and `VITE_RAILWAY_SERVER_URL` as environment variables on the hosting platform.
