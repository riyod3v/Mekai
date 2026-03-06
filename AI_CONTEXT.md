# Mekai AI Context File

## AI Development Context for Coding Agents

This document explains the architecture, constraints, and rules of the Mekai project so AI coding agents can safely generate code without introducing architectural conflicts.

---

## Project Overview

Mekai is an OCR-assisted manga reading platform that allows users to:

- Read manga scans
- Select speech bubbles for OCR
- Translate text
- Store vocabulary in a Word Vault
- Share manga libraries between translators and readers

The application prioritizes **user-controlled OCR** instead of full-page OCR.

---

## Core Architecture

Mekai follows a hybrid frontend + backend service architecture.

```
React Frontend
      │
      ▼
Supabase Backend
(Auth • Postgres • Storage • Realtime)
      │
      ▼
External Python OCR API
```

### Important Architectural Rule

> **OCR must not run inside the browser or Vercel serverless functions.**

Reasons:

- OCR models exceed serverless memory limits
- OCR processing is CPU intensive
- Vercel cold starts break OCR workflows

Therefore OCR runs in a dedicated Python microservice.

---

## OCR Workflow

The OCR system works as follows:

1. User draws a bounding box around a speech bubble.
2. The browser crops the selected region using Canvas.
3. The image is upscaled 2× to improve OCR accuracy.
4. The image is uploaded to **Supabase Storage** — Bucket: `ocr-temp`.
5. A signed URL is generated.
6. The signed URL is sent to the OCR API:

```json
POST /ocr
{
  "imageUrl": "<signed-url>"
}
```

7. The OCR API downloads the image and performs Japanese text recognition.
8. Extracted text is returned to the frontend:

```json
{
  "text": "こんにちは"
}
```

9. The frontend sends the text to the translation service.

---

## Translation System

Translation is handled by a pluggable service layer.

**Location:** `src/services/translation.ts`

Supported translation providers:

- LibreTranslate
- DeepL
- Google Translate

> **Fallback systems must not be added automatically.**
> Translation providers must be explicitly configured through environment variables.

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
| `pages` | Manga page images | `{userId}/manga/{mangaId}/chapters/{chapterId}/{pageNumber}.png` |
| `ocr-temp` | Temporary cropped speech bubbles for OCR processing | Short-lived, no long-term storage needed |

---

## Frontend Responsibilities

The React frontend handles:

- Manga reading UI
- Speech bubble selection
- OCR request creation
- Translation overlays
- Word Vault management

> **The frontend never performs OCR directly.**

**Important UI Component:** `src/components/OCRSelectionLayer.tsx`

Responsibilities:
- Draw bounding box
- Crop image region
- Upscale image
- Send OCR request

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

- **Page-by-page mode**
- **Vertical scroll mode**

**Location:** `src/pages/MangaReaderPage.tsx`

---

## Environment Variables

### Frontend

| Variable | Purpose |
|----------|---------|
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key |
| `VITE_OCR_API_URL` | Python OCR service URL |
| `VITE_TRANSLATE_API_URL` | Translation service URL |
| `VITE_TRANSLATE_API_KEY` | Translation service API key |

---

## Python OCR Service

**Location:** `py-mekai-api/`

```
py-mekai-api/
├── server.py
├── requirements.txt
└── models/
```

**Endpoint:**

```json
POST /ocr

Input:  { "imageUrl": string }
Output: { "text": string }
```

---

## Removed Systems

The following systems were **intentionally removed** and must **not** be reintroduced:

| System | Reason |
|--------|--------|
| Tesseract.js | Poor accuracy, runs in browser |
| MyMemory translation | Reliability issues, API limitations |
| Apify OCR actor | API limitations |

---

## Development Rules for AI Agents

AI agents must follow these rules:

1. **Do not add OCR libraries to the browser.**
2. **Do not run OCR inside Vercel functions.**
3. **Do not reintroduce removed systems** (Tesseract.js, MyMemory, Apify).
4. **Avoid duplicate service layers.**
5. If modifying Supabase queries, **preserve RLS compatibility**.
6. **Avoid breaking existing file paths.**
7. Maintain separation between: `components` / `services` / `lib` / `pages`

---

## Expected Future Enhancements

Possible improvements (not part of the current system):

- Speech bubble detection models
- GPU OCR acceleration
- AI translation context improvement
- Text overlay editing tools

---

## Summary

Mekai is built around user-controlled selective OCR:

| Layer | Responsibility |
|-------|---------------|
| **Frontend** | Selection UI, overlays, Word Vault |
| **Supabase** | Storage, database, auth, realtime |
| **Python API** | OCR processing, translation |

This architecture allows the platform to scale while keeping the frontend lightweight.
