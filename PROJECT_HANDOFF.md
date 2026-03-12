## Coding Agent Initialization Prompt (Mekai Project)

### Project Context

Mekai is a production-grade manga reader + translator platform.

**Architecture stack:**

- Frontend: React 19 + Vite 7 + TypeScript + Tailwind CSS v4
- Data fetching: TanStack Query v5
- Backend: Supabase (Postgres + Storage + Auth + Realtime)
- OCR/Translation: Python FastAPI microservice (manga-ocr local / PaddleOCR Railway + OPUS-MT)
- Frontend deployment: Vercel (SPA rewrite via `vercel.json`)
- API deployment: Railway Free Tier (strict 512 MB RAM limit)
- Content format: Manga chapters uploaded as CBZ (zip of images)

**Quick orientation:**

- `AI_CONTEXT.md` — full architecture reference, OCR flow, env vars, constraints
- `AI_RULESET.md` — coding rules for agents
- `AI _REFACTOR _DEBUG.md` — static analysis, dead code audit, known issues

---

### What Is Already Implemented

All core features are complete and production-ready:

| Feature | Status |
|---------|--------|
| Role-based auth (Reader / Translator) | ✅ Done |
| Shared manga library (Translator uploads, Reader reads) | ✅ Done |
| Private manga uploads for Readers | ✅ Done |
| Realtime manga/chapter sync via Supabase Realtime | ✅ Done |
| CBZ extraction in-browser (JSZip) | ✅ Done |
| Selective OCR (user drag-selects speech bubble) | ✅ Done |
| PaddleOCR via Python FastAPI on Railway | ✅ Done |
| manga-ocr (kha-white) for local development | ✅ Done |
| OPUS-MT translation (ja→en) via Python FastAPI | ✅ Done |
| Romaji generation (wanakana, client-side) | ✅ Done |
| Translation overlays on manga pages | ✅ Done |
| Private translation history per user | ✅ Done |
| Published translations (translator → readers) | ✅ Done |
| Word Vault (bookmark OCR results) | ✅ Done |
| Reading progress tracking (per chapter) | ✅ Done |
| Dual reading modes: Page (Swiper) + Scroll | ✅ Done |
| RTL / LTR reading direction toggle | ✅ Done |
| OCR mode locks Swiper (no swipe/drag during selection) | ✅ Done |
| ESC key exits OCR mode | ✅ Done |
| Dark/light theme | ✅ Done |

---

### Important Rules For This Project

#### 1. Avoid Redundant Logic

Reuse existing utilities. Do not duplicate functions with different names.

#### 2. Optimize for Railway's 512 MB RAM Limit

Do NOT introduce:
- Models >300 MB loaded in memory
- Multiple workers or GPU (CUDA) dependencies
- Unbounded concurrent inference

OCR must always run through the dedicated Python FastAPI service on Railway. Never move OCR into the browser or Vercel functions.

#### 3. Maintain Database Compatibility

Never modify existing table columns without explicit instruction.

Tables that must remain compatible:

- `manga`
- `chapters`
- `profiles`
- `reading_progress`
- `translation_history`
- `chapter_translations`
- `word_vault`

Key columns in `chapter_translations` / `translation_history`:

| Column | Purpose |
|--------|---------|
| `chapter_id` | Chapter reference |
| `page_index` | Page number (0-indexed) |
| `region` | JSONB: `{ x, y, w, h }` as 0–1 fractions of image size |
| `region_hash` | Deterministic key: `"x.toFixed(4)-y.toFixed(4)-w.toFixed(4)-h.toFixed(4)"` |
| `ocr_text` | Raw PaddleOCR output |
| `translated` | OPUS-MT translated text |
| `romaji` | Optional wanakana romanisation |

#### 4. Storage Buckets

- `covers` — manga cover images (`{userId}/manga/{mangaId}/cover.png`)
- `chapters` — CBZ chapter files (`{userId}/{mangaId}/{chapterNumber}.cbz`)

Do not create new buckets without explicit instruction.

#### 5. No Forbidden Systems

Do not reintroduce:
- `tesseract.js` (removed: poor manga accuracy, runs in browser)
- `mymemory` translation API (removed: unreliable)
- `manga-ocr` on Railway (removed: ~444 MB, exceeds Railway RAM; used locally only)
- `Flask` (replaced by FastAPI)

---

### Known Remaining Improvement Opportunities

See `AI _REFACTOR _DEBUG.md` §7–§9 for full detail. Summary:

| Area | Opportunity |
|------|-------------|
| `src/lib/ocr/ocr.ts` | Dead Tesseract.js code (`ocrFromImageElement` and helpers) still present; safe to remove along with the `tesseract.js` npm dependency |
| Double canvas crop | `hasInkContent()` and `cropToDataUrl()` both call `cropToCanvas()`; can be unified |
| CBZ extraction | All pages extracted upfront; lazy extraction would reduce RAM for large chapters |
| ResizeObserver | One observer per `TranslationOverlay`; a single shared observer would be better at scale |
| Auto-bubble detection | No automatic speech bubble detection yet; user must manually select regions |
