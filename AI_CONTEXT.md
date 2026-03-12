# Mekai AI Context File

## AI Development Context for Coding Agents

This document explains the architecture, constraints, and rules of the Mekai project so AI coding agents can safely generate code without introducing architectural conflicts.

---

## Project Overview

Mekai is an OCR-assisted manga reading platform that allows users to:

- Read manga scans
- Select speech bubbles for OCR
- Translate text (Japanese to English)
- Store vocabulary in a Word Vault
- Share manga libraries between translators and readers

The application prioritizes **user-controlled OCR** instead of full-page OCR.

---

## Core Architecture

Mekai follows a hybrid frontend + backend service architecture.

```
React Frontend (Vite SPA)
      |
      v
Supabase Backend
(Auth - Postgres - Storage - Realtime)
      |
      v
Python OCR/Translation API (FastAPI)
(Local: manga-ocr + OPUS-MT | Railway: PaddleOCR + OPUS-MT)
```

### Important Architectural Rules

> **OCR must not run inside the browser or Vercel serverless functions.**

Reasons:

- OCR models exceed serverless memory limits
- OCR processing is CPU intensive
- Vercel cold starts break OCR workflows

Therefore OCR runs in a dedicated Python FastAPI microservice deployed on Railway.

> **Railway Free Tier enforces a strict 512 MB RAM limit.** All backend dependencies and runtime behavior are tuned for this constraint. See the [Memory Constraints](#memory-constraints-railway-free-tier) section.

---

## OCR Workflow

The OCR system works as follows:

1. User draws a bounding box around a speech bubble.
2. The browser crops the selected region using Canvas.
3. An ink pre-flight check (`hasInkContent`) rejects empty selections.
4. The cropped image is encoded as base64.
5. The base64 image is sent to the OCR API:

```json
POST /ocr
{
  "image": "<base64-data>"
}
```

6. The OCR API processes the image and returns extracted text:
   - **Local:** manga-ocr (kha-white/manga-ocr) — PyTorch ViT encoder-decoder trained on manga
   - **Railway:** PaddleOCR (CPU-only) — fits within 512 MB RAM limit

```json
{
  "text": "Japanese text"
}
```

7. The frontend sends the text to the translation endpoint:

```json
POST /translate
{
  "q": "Japanese text",
  "source": "ja",
  "target": "en"
}
```

8. Translated text + romaji is rendered as a speech bubble overlay.

---

## Translation System

Translation is handled via the Python API's OPUS-MT (Helsinki-NLP/opus-mt-ja-en) model.

**Frontend client:** `src/lib/api/manga-ocr-py-API.ts`

**Translation wrapper:** `src/lib/translate/translate.ts`

The Python API endpoint:

```
POST /translate
{ "q": "...", "source": "ja", "target": "en" }
-> { "translatedText": "..." }
```

> **No fallback exists.** If the Python API is unavailable, translation shows an error.
> Removed providers (Tesseract.js, MyMemory, LibreTranslate) must not be reintroduced.

---

## Supabase Responsibilities

Supabase is used for:

- Authentication
- User roles
- Database
- Realtime updates
- Image storage

Supabase does **not** perform OCR or translation.

### Storage Buckets

| Bucket | Purpose | Path Format |
|--------|---------|-------------|
| `covers` | Manga cover images | `{userId}/manga/{mangaId}/cover.png` |
| `chapters` | Manga CBZ files | `{userId}/{mangaId}/{chapterNumber}.cbz` |

---

## Frontend Responsibilities

The React frontend handles:

- Manga reading UI
- Speech bubble selection (OCR region drawing)
- OCR request creation (base64 encoding + API call)
- Translation overlays
- Word Vault management
- CBZ file extraction (JSZip)

> **The frontend never performs OCR directly.**

**Key UI Component:** `src/ui/components/OCRSelectionLayer.tsx`

Responsibilities:
- Draw bounding box on manga page
- Trigger `ocrAndTranslate()` in `src/lib/utils/browserAPI.ts`

---

## Word Vault

The Word Vault stores vocabulary extracted from OCR results.

Each entry contains:

| Field | Type |
|-------|------|
| `original_text` | string |
| `translated_text` | string |
| `romaji` | string (optional) |
| `created_at` | timestamp |
| `user_id` | uuid |

**Access control:** Owner only.

---

## Reading Modes

Two reading modes are supported:

- **Page-by-page mode** — one page at a time using Swiper.js carousel (RTL/LTR direction toggle, keyboard arrow navigation, ESC to exit OCR)
- **Vertical scroll mode** — all pages stacked continuously, IntersectionObserver tracks reading progress

Settings (mode, direction) are persisted to `localStorage`. Reading progress (last page index) is saved to the `reading_progress` Supabase table.

---

## Environment Variables

### Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_RAILWAY_SERVER_URL` | Python OCR service URL (production) |
| `VITE_LOCAL_API_URL` | Local dev API URL (default: `http://localhost:5100`) |

### Python API (Railway)

| Variable | Purpose |
|----------|---------|
| `PORT` | Injected by Railway |
| `MEKAI_ALLOWED_ORIGINS` | Comma-separated CORS origins |

---

## Python OCR/Translation Service

**Location:** `py-mekai-api/`

```
py-mekai-api/
|-- main.py            <- FastAPI server (manga-ocr local / PaddleOCR Railway + OPUS-MT)
|-- Dockerfile         <- Railway deployment image
|-- railwayReq.txt     <- Railway deployment deps (PaddleOCR)
|-- localReq.txt       <- Local development deps (manga-ocr)
|-- railway.json
|-- Procfile
+-- README.md
```

**Endpoints:**

| Method | Path | Input | Output |
|--------|------|-------|--------|
| GET | `/` | -- | Health check |
| GET | `/ocr/health` | -- | OCR readiness |
| POST | `/ocr` | `{ "image": "<base64>" }` | `{ "text": "..." }` |
| GET | `/translate/health` | -- | Translation readiness |
| POST | `/translate` | `{ "q": "...", "source": "ja", "target": "en" }` | `{ "translatedText": "..." }` |

---

## Memory Constraints (Railway Free Tier)

> **The Python API runs on Railway's Free Tier with a strict 512 MB RAM limit.**

Optimizations in place:

- **CPU-only PyTorch** (~200 MB vs ~2.5 GB with CUDA)
- **PaddleOCR on Railway** replaces the heavier manga-ocr (~170 MB vs ~444 MB)
- **manga-ocr locally** for superior manga OCR accuracy (no Railway RAM constraint)
- **CPU threads pinned to 2** on Railway to prevent scheduler contention
- **OCR requests serialized** via semaphore — one inference at a time
- **Translation model loaded lazily** on first request (saves ~200 MB cold-start RAM)
- **Image input capped at 512px** max dimension
- **Single Uvicorn worker** (no multi-process overhead)

AI agents must not introduce dependencies that increase RAM usage without explicit approval. Any new model or library must be evaluated against the 512 MB budget.

---

## Removed Systems

The following systems were **intentionally removed** and must **not** be reintroduced:

| System | Reason |
|--------|--------|
| Tesseract.js | Poor accuracy for manga, runs in browser |
| MyMemory translation | Reliability issues, API limitations |
| Apify OCR actor | API limitations |
| Flask | Replaced by FastAPI for async support |

> **Note:** manga-ocr (kha-white) is now used for **local development** only. It is still too large (~444 MB) for Railway’s 512 MB RAM limit. Railway continues to use PaddleOCR.

---

## Development Rules for AI Agents

AI agents must follow these rules:

1. **Do not add OCR libraries to the browser.**
2. **Do not run OCR inside Vercel functions.**
3. **Do not reintroduce removed systems** (Tesseract.js, MyMemory, Apify).
4. **Do not add manga-ocr to Railway** — it exceeds the 512 MB RAM limit. manga-ocr is local-only.
5. **Avoid duplicate service layers.**
5. If modifying Supabase queries, **preserve RLS compatibility**.
6. **Avoid breaking existing file paths.**
7. Maintain separation: `ui/components` / `ui/pages` / `services` / `lib` / `hooks` / `context`
8. **Respect the 512 MB Railway RAM limit** — do not add heavyweight dependencies.

---

## Project Structure Reference

```
src/
|-- context/           <- React context providers (notifications, theme)
|-- hooks/             <- Custom React hooks (auth, realtime, role, theme, history)
|-- lib/
|   |-- api/           <- HTTP clients for external APIs
|   |-- ocr/           <- Canvas crop, ink check, image preprocessing
|   |-- supabase/      <- Supabase client (single instance)
|   |-- translate/     <- Translation + romaji helpers
|   +-- utils/         <- browserAPI orchestrator, date/redirect/logging utils
|-- services/          <- All Supabase DB operations (one file per table)
|-- types/             <- Shared TypeScript types + regionHash()
+-- ui/
    |-- components/    <- Reusable UI components
    +-- pages/         <- Route-level page components
```

---

## Expected Future Enhancements

Possible improvements (not part of the current system):

- Automatic speech bubble detection (no manual selection)
- GPU OCR acceleration
- Translation context improvement
- Text overlay editing tools

---

## Summary

Mekai is built around user-controlled selective OCR:

| Layer | Responsibility |
|-------|---------------|
| **Frontend** | Selection UI, overlays, Word Vault, reading modes |
| **Supabase** | Storage, database, auth, realtime |
| **Python API** | OCR (PaddleOCR) + translation (OPUS-MT ja-en) |

This architecture keeps the frontend lightweight while staying within Railway's 512 MB RAM limit.
