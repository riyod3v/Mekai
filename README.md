# Mekai — OCR-Assisted Manga Reading Platform

A production-grade web application for reading untranslated manga scans with user-controlled OCR, selective translation replay, real-time shared uploads, and a persistent Word Vault.

Built with React 19 + Vite 7 + TypeScript + Tailwind CSS v4 + Supabase (Auth · Postgres · Storage · Realtime) + Tesseract.js.

---

## Features at a Glance

| Feature                          | Description                                                                          |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| **Role-based authentication**    | Sign up as Reader or Translator; role stored in `profiles`                           |
| **Shared Manga Library**         | Translators upload manga & chapters; Readers browse instantly                        |
| **Private Reader Uploads**       | Readers upload personal `.cbz` files (isolated & private)                            |
| **Realtime synchronization**     | Dashboards auto-update via Supabase Realtime subscriptions                           |
| **Selective OCR**                | Draw bounding box on a speech bubble → OCR runs only on that region                  |
| **Translation pipeline**         | Pluggable translation service (LibreTranslate / DeepL / Google ready)                |
| **Selective Translation Replay** | Previously translated regions per page are stored and toggled without re-running OCR |
| **Reading progress tracking**    | Resume from last-read page per chapter                                               |
| **Word Vault**                   | Save original + translated + optional romaji entries; searchable and deletable       |
| **Dual reading modes**           | Page-by-page mode and Vertical Scroll mode                                           |
| **Optimized OCR handling**       | Region cropping + 2× upscale preprocessing for better recognition                    |

---

## Project Structure

```
mekai/
├── supabase/
│   ├── schema.sql
│   └── storage.sql
├── src/
│   ├── components/
│   │   ├── ChapterUploadForm.tsx
│   │   ├── Drawer.tsx
│   │   ├── EmptyState.tsx
│   │   ├── ErrorState.tsx
│   │   ├── LoadingSpinner.tsx
│   │   ├── MangaCard.tsx
│   │   ├── MangaUploadForm.tsx
│   │   ├── Modal.tsx
│   │   ├── Navbar.tsx
│   │   ├── OCRSelectionLayer.tsx
│   │   ├── ProtectedRoute.tsx
│   │   ├── TranslationTooltip.tsx
│   │   └── WordVaultPanel.tsx
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useRealtimeManga.ts
│   │   ├── useReadingProgress.ts
│   │   └── useRole.ts
│   ├── lib/
│   │   ├── dateUtils.ts
│   │   ├── ocr.ts
│   │   ├── supabase.ts
│   │   └── uuid.ts
│   ├── pages/
│   │   ├── Auth.tsx
│   │   ├── MangaEntryPage.tsx
│   │   ├── MangaReaderPage.tsx
│   │   ├── ReaderDashboard.tsx
│   │   ├── TranslatorDashboard.tsx
│   │   └── WordVaultPage.tsx
│   ├── services/
│   │   ├── chapters.ts
│   │   ├── manga.ts
│   │   ├── pages.ts
│   │   ├── profiles.ts
│   │   ├── translation.ts
│   │   ├── translationHistory.ts
│   │   └── wordVault.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── .env
└── README.md
```

---

## Running Locally

### 1 — Set up environment variables

```bash
cp .env .env.local
```

Edit `.env.local`:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Find both values in **Supabase Dashboard → Project Settings → API**.

### 2 — Run the Supabase SQL schema

1. Open **Supabase Dashboard → SQL Editor**
2. Paste and run the contents of `supabase/schema.sql`

This creates:
Profiles table with roles
Manga / Chapters / Pages tables
Translation history table
Word Vault table
Reading progress table
RLS policies
Realtime configuration

### 2b — Run the storage SQL

1. In the SQL Editor, paste and run `supabase/storage.sql`

This creates the `avatar_url`,`covers`, and `chapters` buckets and all storage with ownership-based RLS policies.

### 3 — Install dependencies & start

```bash
npm install
npm run dev
```

Visit `http://localhost:5173`.

### 4 — (Optional) Real Translation API
To use real translations instead of the built-in placeholder:

1. Deploy [LibreTranslate](https://libretranslate.com/) or use a hosted instance
2. Add to `.env.local`:
   ```
   VITE_TRANSLATE_API_URL=https://your-libretranslate-instance
   VITE_TRANSLATE_API_KEY=your-api-key
   ```
The `translateText()` function in `src/services/translation.ts` will auto-detect and use these.

---

## Role Flows

### Reader Flow

```
/auth → Sign up as Reader
        ↓
/reader → Shared Library (live via Realtime)
          My Private Uploads (isolated)
        ↓
/manga/:id → Metadata + chapter list
        ↓
/read/:chapterId →
  • Toggle Page-by-page ↔ Vertical Scroll
  • Activate OCR → draw bounding box
      → Region cropped via Canvas
      → Upscaled 2×
      → Tesseract.js processes only selection
      → Translation tooltip displayed
      → Option to save to Word Vault
  • Toggle previously translated overlays
  • Resume from last saved reading position
        ↓
/word-vault → Search, browse, delete saved entries
```

### Translator Flow

```
/auth → Sign up as Translator
        ↓
/translator → Create shared manga
               Upload / Update chapters
               Images auto-sorted by filename
               Readers see updates instantly
        ↓
/manga/:id → Manage chapters (own manga only)
```

---

## Supabase Configuration Summary

| Table | Access |
|---|---|
| `profiles` | Public read; self write |
| `manga` | Shared → all authenticated; Private → owner only |
| `chapters` | Accessible if parent manga is accessible; uploader can modify |
| `pages` | Accessible if chapter is accessible; chapter uploader can modify |
| `translation_history` | Owner-only (`user_id`) |
| `word_vault` | Owner-only (`user_id`) |

**Realtime** is enabled on `manga` and `chapters` tables.

**Storage buckets**: `covers` and `pages`, both publicly readable.

### Storage Upload Path Rules

All uploads **must** use the uploader's `user.id` as the first path segment.
This is how the delete RLS policies verify ownership without a DB lookup.

| Bucket | Path pattern | Example |
|---|---|---|
| `covers` | `{uid}/manga/{mangaId}/cover.{ext}` | `abc123/manga/def456/cover.png` |
| `pages` | `{uid}/manga/{mangaId}/chapters/{chapterId}/{pageNumber}.{ext}` | `abc123/manga/def456/chapters/ghi789/1.png` |

Run `supabase/storage.sql` in the **Supabase SQL Editor** after `schema.sql` to create the buckets and apply these policies.

---

## Tech Stack

| Layer | Library |
|---|---|
| UI Framework | React 19 + TypeScript |
| Build tool | Vite 7 |
| Styling | Tailwind CSS v4 |
| Router | React Router v7 |
| Data fetching | TanStack Query v5 |
| Backend | Supabase (Auth + Postgres + Storage + Realtime) |
| OCR | Tesseract.js (dynamic import, in-browser) |
| Icons | Lucide React |
| Toasts | react-hot-toast |

---

## Build for Production

```bash
npm run build
```

Output is in `dist/`. Deploy to Vercel, Netlify, Cloudflare Pages, or any static host.
Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` as environment variables on the platform.
