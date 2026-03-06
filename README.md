# Mekai — OCR-Assisted Manga Reading Platform

A production-grade web application for reading untranslated manga scans with user-controlled OCR selection, translation overlays, shared manga libraries, and a persistent Word Vault.

Built with React 19 + Vite 7 + TypeScript + Tailwind CSS v4 + Supabase (Auth · Postgres · Storage · Realtime) and an external Python OCR microservice.

---
## Core Architecture
Mekai follows a hybrid client–service architecture.

```
Browser (React Frontend)
        │
        │
        ▼
Supabase Backend
(Auth · Postgres · Storage · Realtime)
        │
        │
        ▼
External OCR Service (Python API)
```
---

## OCR Processing Pipeline

Unlike typical manga readers that OCR the entire page, Mekai performs selective OCR on user-selected regions.

Step-by-step flow

1️⃣ User selects a speech bubble using the OCRSelectionLayer.

2️⃣ The browser crops the selected region using HTML Canvas.

3️⃣ The cropped image is upscaled 2× to improve OCR accuracy.

4️⃣ The image is uploaded to a temporary storage bucket:
```
Supabase Storage
Bucket: ocr-temp
```
5️⃣ A signed URL is generated.

6️⃣ The signed URL is sent to the Python OCR API.
```
POST /ocr
{
  imageUrl: "<signed-url>"
}
```
7️⃣ The OCR service:

• downloads the image

• detects Japanese text

• returns extracted text

8️⃣ The frontend sends the extracted text to the translation service.

9️⃣ The translated text is rendered as a speech bubble overlay.
---

## Features at a Glance

```
Browser (React Frontend)
        |
        |
        v
Supabase Backend
(Auth · Postgres · Storage · Realtime)
        |
        |
        v
External OCR Service (Python API)
```

## OCR Processing Pipeline

Unlike typical manga readers that OCR the entire page, Mekai performs selective OCR on user-selected regions.

### Step-by-step flow

1. User selects a speech bubble using the OCRSelectionLayer.
2. The browser crops the selected region using HTML Canvas.
3. The cropped image is upscaled 2x to improve OCR accuracy.
4. The image is uploaded to a temporary storage bucket:

   Supabase Storage
   Bucket: ocr-temp

5. A signed URL is generated.
6. The signed URL is sent to the Python OCR API.

```json
POST /ocr
{
  "imageUrl": "<signed-url>"
}
```

7. The OCR service:

- Downloads the image
- Detects Japanese text
- Returns extracted text

8. The frontend sends the extracted text to the translation service.
9. The translated text is rendered as a speech bubble overlay.

## Why OCR Runs Outside Vercel

Large OCR models cannot run inside Vercel serverless functions.

Limitations include:

- Cold start restrictions
- Memory limits
- Execution time limits
- Model size restrictions

Therefore Mekai uses a separate Python OCR microservice that can run on:

- Railway
- Render
- GPU server
- Local development server

## Updated Project Structure

```
mekai/
|
+-- supabase/
|   +-- schema.sql
|   +-- storage.sql
|
+-- src/
|
|   +-- assets/
|   |   +-- IMG/
|
|   +-- components/
|   |   +-- OCRSelectionLayer.tsx
|   |   +-- TranslationTooltip.tsx
|   |   +-- WordVaultPanel.tsx
|   |   +-- ...
|
|   +-- hooks/
|   |   +-- useAuth.ts
|   |   +-- useRealtimeManga.ts
|   |   +-- useReadingProgress.ts
|
|   +-- lib/
|   |   +-- supabase/
|   |   |   +-- client.ts
|   |   +-- dateUtils.ts
|   |   +-- uuid.ts
|   |   +-- ocr.ts
|
|   +-- services/
|   |   +-- manga.ts
|   |   +-- chapters.ts
|   |   +-- pages.ts
|   |   +-- translation.ts
|   |   +-- translationHistory.ts
|   |   +-- wordVault.ts
|
|   +-- pages/
|   |   +-- MangaReaderPage.tsx
|   |   +-- ReaderDashboard.tsx
|   |   +-- TranslatorDashboard.tsx
|
|   +-- main.tsx
|
+-- py-mekai-api/
|   +-- server.py
|   +-- requirements.txt
|   +-- models/
|
+-- README.md
```

## OCR Service (Python)

The OCR service is a standalone microservice responsible for:

- Downloading images
- Performing Japanese OCR
- Returning extracted text

Example API response:

```json
POST /ocr

Request:
{
  "imageUrl": "https://supabase-url/ocr-temp/..."
}

Response:
{
  "text": "こんにちは"
}
```

## Translation Pipeline

Translation is pluggable.

Supported options:

- LibreTranslate
- DeepL
- Google Translate
- Custom translation API

The translation service is implemented in:

`src/services/translation.ts`

## Key Design Philosophy

Mekai is designed with modular AI architecture.

Key principles:

- OCR runs in a dedicated microservice
- The frontend handles UI and image selection
- Supabase handles storage, auth, and realtime sync
- Translation providers are swappable

This makes the system scalable and provider-agnostic.

## Environment Variables

```env
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

VITE_TRANSLATE_API_URL=
VITE_TRANSLATE_API_KEY=

VITE_OCR_API_URL=
```

## Deployment

Frontend can be deployed to:

- Vercel
- Netlify
- Cloudflare Pages

Python OCR service can be deployed to:

- Railway
- Render
- GPU cloud server

## What Changed (Recent Refactor)

The following components were removed:

- Tesseract.js browser OCR
- Apify OCR integration
- MyMemory translation fallback

OCR is now handled by the Python OCR microservice.

## Features at a Glance

| Feature | Description |
|---|---|
| Role-based authentication | Sign up as Reader or Translator; role stored in `profiles` |
| Shared Manga Library | Translators upload manga and chapters; Readers browse instantly |
| Private Reader Uploads | Readers upload personal `.cbz` files (isolated and private) |
| Realtime synchronization | Dashboards auto-update via Supabase Realtime subscriptions |
| Selective OCR | Draw bounding box on a speech bubble; OCR runs only on that region |
| Translation pipeline | Pluggable translation service (`py-mekai-api` local service; external provider-ready) |
| Selective Translation Replay | Previously translated regions per page are stored and toggled without re-running OCR |
| Reading progress tracking | Resume from last-read page per chapter |
| Word Vault | Save original plus translated text with optional romaji; searchable and deletable |
| Dual reading modes | Page-by-page mode and Vertical Scroll mode |
| Optimized OCR handling | Region cropping plus upscale preprocessing for better recognition |

## Running Locally

### 1 - Set up environment variables

```bash
cp .env .env.local
```

Edit `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_MEKAI_API_URL=http://localhost:5100
```

Find Supabase values in `Supabase Dashboard -> Project Settings -> API`.

### 2 - Run your Supabase SQL schema

1. Open `Supabase Dashboard -> SQL Editor`.
2. Paste and run your schema SQL (profiles, manga, chapters, pages, translation history, word vault, reading progress, and RLS policies).
3. Enable Realtime on `manga` and `chapters` if not already enabled.

### 2b - Run storage SQL / bucket setup

In SQL Editor, create and policy-protect the `avatar_url`, `covers`, and `chapters` buckets with ownership-based access rules.

### 3 - Install dependencies and start frontend

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`.

### 4 - Start the local OCR and translation API

From `py-mekai-api/`:

```bash
uv run server.py
```

If `uv` is not installed, use a virtual environment and run:

```bash
pip install -r requirements.txt
python server.py
```

## Role Flows

### Reader Flow

```text
/auth -> Sign up as Reader
  ↓
/reader -> Shared Library (live via Realtime)
       My Private Uploads (isolated)
  ↓
/manga/:id -> Metadata + chapter list
  ↓
/read/:chapterId ->
  - Toggle Page-by-page and Vertical Scroll
  - Activate OCR -> draw bounding box
  -> Region cropped via Canvas
  -> Upscaled preprocess
  -> OCR runs only on selection
  -> Translation overlay displayed
  -> Option to save to Word Vault
  - Toggle previously translated overlays
  - Resume from last saved reading position
  ↓
/word-vault -> Search, browse, delete saved entries
```

### Translator Flow

```text
/auth -> Sign up as Translator
  ↓
/translator -> Create shared manga
       Upload and update chapters
       Images auto-sorted by filename
       Readers see updates instantly
  ↓
/manga/:id -> Manage chapters (own manga only)
```

## Supabase Configuration Summary

| Table | Access |
|---|---|
| `profiles` | Public read; self write |
| `manga` | Shared: all authenticated users; Private: owner only |
| `chapters` | Accessible if parent manga is accessible; chapter uploader can modify |
| `pages` | Accessible if chapter is accessible; chapter uploader can modify |
| `translation_history` | Owner-only (`user_id`) |
| `word_vault` | Owner-only (`user_id`) |

Realtime is enabled on `manga` and `chapters` tables.

Storage buckets: `covers` and `pages`, both publicly readable.

### Storage Upload Path Rules

All uploads should use the uploader `user.id` as the first path segment so delete policies can verify ownership without a DB lookup.

| Bucket | Path pattern | Example |
|---|---|---|
| `covers` | `{uid}/manga/{mangaId}/cover.{ext}` | `abc123/manga/def456/cover.png` |
| `pages` | `{uid}/manga/{mangaId}/chapters/{chapterId}/{pageNumber}.{ext}` | `abc123/manga/def456/chapters/ghi789/1.jpg` |

## Tech Stack

| Layer | Library |
|---|---|
| UI Framework | React 19 + TypeScript |
| Build tool | Vite 7 |
| Styling | Tailwind CSS v4 |
| Router | React Router v7 |
| Data fetching | TanStack Query v5 |
| Backend | Supabase (Auth + Postgres + Storage + Realtime) |
| OCR | `py-mekai-api` companion service (Python) |
| Icons | Lucide React |
| Toasts | react-hot-toast |

---

## Build for Production

```bash
npm run build
```

Output is in `dist/`. Deploy to Vercel, Netlify, Cloudflare Pages, or any static host.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables on the platform.
