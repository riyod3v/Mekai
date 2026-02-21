# Mekai — Interactive Manga Reading Platform

A production-grade web application for reading untranslated / foreign-language manga scans with in-browser OCR, selective translation, and a personal Word Vault.

Built with **React 19 + Vite 7 + TypeScript + Tailwind CSS v4 + Supabase** (Auth · Postgres · Storage · Realtime).

---

## Features at a Glance

| Feature | Description |
|---|---|
| **Dual-role auth** | Sign up as Reader or Translator; role stored in `profiles` |
| **Shared Library** | Translators upload manga & chapters; Readers browse read-only |
| **Private Uploads** | Readers can upload their own private manga (hidden from others) |
| **Real-time updates** | Reader Dashboard refreshes instantly via Supabase Realtime when a Translator uploads |
| **User-controlled OCR** | Draw a rectangular region on any manga page → Tesseract.js runs OCR on that crop |
| **Translation** | Pluggable translation API (placeholder included; swap in LibreTranslate / DeepL / Google) |
| **Translation History Replay** | Previously translated regions per page are stored and can be toggled ON/OFF without re-running OCR |
| **Word Vault** | Save original + translated + romaji entries; searchable, deletable |
| **Page-by-page & Scroll** | Two reading modes; responsive side panels → drawers on mobile |

---

## Project Structure

```
mekai/
├── supabase/
│   ├── schema.sql            # Full SQL schema + RLS policies
│   └── storage.sql           # Storage buckets + policies
├── src/
│   ├── components/           # Reusable UI
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
│   │   └── useRole.ts
│   ├── lib/
│   │   ├── dateUtils.ts
│   │   ├── supabase.ts
│   │   └── uuid.ts
│   ├── pages/
│   │   ├── Auth.tsx             → /auth
│   │   ├── MangaEntryPage.tsx   → /manga/:id
│   │   ├── MangaReaderPage.tsx  → /read/:chapterId
│   │   ├── ReaderDashboard.tsx  → /reader
│   │   ├── TranslatorDashboard.tsx → /translator
│   │   └── WordVaultPage.tsx    → /word-vault
│   ├── services/
│   │   ├── chapters.ts
│   │   ├── manga.ts
│   │   ├── pages.ts
│   │   ├── profiles.ts
│   │   ├── translation.ts
│   │   └── wordVault.ts
│   ├── types/
│   │   └── index.ts
│   ├── App.tsx
│   └── main.tsx
├── .env.example
└── README.md
```

---

## Running Locally

### 1 — Set up environment variables

```bash
cp .env.example .env.local
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

This creates all tables, RLS policies, realtime subscriptions, and triggers.

### 2b — Run the storage SQL

1. In the same SQL Editor, paste and run `supabase/storage.sql`

This creates the `covers` and `pages` buckets and all storage RLS policies.

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
/auth  →  Sign up as Reader
         ↓
/reader  →  Shared Library tab (live-updated via Realtime)
             My Private Uploads tab (only visible to you)
         ↓
/manga/:id  →  Metadata + chapter list
         ↓
/read/:chapterId  →
  • Toggle Page-by-page ↔ Vertical Scroll
  • Click [OCR] → draw a rectangle on a speech bubble
    → Tesseract.js OCRs only that region
    → Translation tooltip: original, translation, romaji
    → Save to Word Vault
  • Right panel: Translation History (toggle overlays ON/OFF per page)
  • Right panel: Word Vault preview
         ↓
/word-vault  →  Browse, search, delete all saved words/phrases
```

### Translator Flow

```
/auth  →  Sign up as Translator
         ↓
/translator  →  Create shared manga (title, description, cover image)
                Select a manga → Upload / Update a chapter (images sorted by filename)
                [Readers see changes immediately via Realtime]
         ↓
/manga/:id  →  View manga; Upload/Update Chapter button (own manga only)
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
