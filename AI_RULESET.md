## Mekai AI Coding Rules

Rules for AI coding agents working on the Mekai project.

These rules exist to prevent architectural corruption, duplicate systems, and wasted prompts.

## Prompt Efficiency Rule

Coding agents must follow a single-task execution model.

Each prompt must complete one clearly defined task only.

Example:

GOOD:

Task: Implement OCR request handler in `src/lib/api/manga-ocr-py-API.ts`.

BAD:

Task: Implement OCR, translation, UI overlay, and database writes.

## Do Not Invent Architecture

Agents must only use the architecture defined in:

`AI_CONTEXT.md`

Do not introduce:

- New backend frameworks
- Alternative databases
- Alternate auth systems

The stack is fixed.

## Technology Stack (Locked)

Frontend:

- React 19
- TypeScript
- Vite 7
- Tailwind CSS v4
- React Router v7
- TanStack Query v5
- Swiper.js (page-mode reader carousel + RTL scrubber)

Backend:

- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Supabase Realtime

OCR/Translation service:

- Python FastAPI microservice
- Local: manga-ocr (kha-white/manga-ocr) + OPUS-MT
- Railway: PaddleOCR (CPU-only) + OPUS-MT
- Deployed on Railway Free Tier (512 MB RAM limit)

## Railway Memory Constraint

> **The Python API runs on Railway's Free Tier with a strict 512 MB RAM limit.**

Agents must not introduce dependencies that increase RAM usage without explicit approval. All backend changes must be evaluated against the 512 MB memory budget. See `AI_CONTEXT.md` for optimization details.

## Forbidden Additions

Agents must NOT add:

- Tesseract.js
- MyMemory API
- Apify OCR actor
- manga-ocr on Railway (PyTorch — exceeds Railway 512 MB RAM budget; local-only)
- Serverless OCR (Vercel functions)
- Flask (replaced by FastAPI)

These were intentionally removed.

## Database Integrity Rules

Never modify existing columns without explicit instruction.

Tables that must remain compatible:

- manga
- chapters
- profiles
- reading_progress
- translation_history
- chapter_translations
- word_vault

## Translation Storage Design

Mekai stores OCR results as persistent translation regions.

Each translation region contains:

- page_index
- region
- region_hash
- ocr_text
- translated
- romaji

These are stored in:

- `chapter_translations` (published, shared)
- `translation_history` (private, per-user)

This enables:

- Translation replay
- Overlay rendering
- Translation sharing

## Region Hash Rule

Each OCR region must generate a deterministic hash:

`region_hash = hash(chapter_id + page_index + region_coordinates)`

This prevents duplicate OCR entries.

Agents must not remove this system.

## Services Directory Rules

All Supabase database operations must be implemented inside:

`src/services/`

Examples:

- `src/services/manga.ts`
- `src/services/chapters.ts`
- `src/services/chapterTranslations.ts`
- `src/services/translationHistory.ts`
- `src/services/wordVault.ts`

## API Client Rules

External API communication (OCR/translation HTTP calls) lives in:

`src/lib/api/`

Example:

- `src/lib/api/manga-ocr-py-API.ts` — HTTP client for the Python OCR/translation API

Components and pages must not directly call external APIs.

## Component Rules

UI logic must stay inside:

`src/ui/components/`

Page-level components go in:

`src/ui/pages/`

Business logic must stay inside:

`src/services/`

Shared utilities go in:

`src/lib/`

## Directory Structure

```
src/
|-- context/           <- React context providers
|-- hooks/             <- Custom React hooks
|-- lib/
|   |-- api/           <- External API HTTP clients
|   |-- ocr/           <- Canvas crop, ink check, preprocessing
|   |-- supabase/      <- Supabase client (single instance)
|   |-- translate/     <- Translation + romaji helpers
|   +-- utils/         <- browserAPI orchestrator, utilities
|-- services/          <- Supabase DB operations
|-- types/             <- Shared TypeScript types
+-- ui/
    |-- components/    <- Reusable UI components
    +-- pages/         <- Route-level page components
```

## Supabase Access Rules

Supabase client must only be created in:

`src/lib/supabase/client.ts`

Barrel re-export at `src/lib/supabase/index.ts`.

No duplicate clients allowed.

## Storage Rules

Buckets:

- `covers` — manga cover images (`{userId}/manga/{mangaId}/cover.png`)
- `chapters` — CBZ chapter files (`{userId}/{mangaId}/{chapterNumber}.cbz`)

Agents must not create new buckets without explicit instruction.

## Reader Mode Rules

- Reading mode (`scroll` | `page`) and direction (`rtl` | `ltr`) are persisted to `localStorage`.
- Reading progress (`last_page_index`) is written to the `reading_progress` Supabase table with debounce.
- In page mode, Swiper touch and mouse-drag must be disabled (`allowTouchMove = false`) when `selectionMode` or an OCR is active. Set this imperatively on the Swiper instance, not just via props.
- Arrow key navigation is blocked while `selectionMode` is active; ESC exits OCR mode.
- Desktop click-to-navigate zones are placed in the gutters outside the `max-w-3xl` reader panel using `fixed` positioning to avoid overlapping the manga image.

## OCR Image Handling

OCR images must:

- Be cropped in browser (Canvas)
- Pass ink pre-flight check (`hasInkContent`)
- Be encoded as base64
- Be sent to the Python API (`POST /ocr`)
- Be processed by manga-ocr (local) or PaddleOCR (Railway) on the server

OCR must never run in browser or Vercel functions.

## Security Requirements

Agents must preserve:

- Supabase RLS compatibility
- Owner-only Word Vault access
- Authenticated uploads
- Signed URL usage for temporary OCR images

## Allowed Future Improvements

Agents may implement:

- OCR performance improvements
- Translation caching
- Speech bubble auto-detection
- Translation editing tools

Only if explicitly requested.

## Mandatory Task Output Format

All coding tasks must be returned in the format:

- TASK
- FILES MODIFIED
- CODE
- RATIONALE

Agents must not produce long explanations unless requested.

## Important Architecture Correction (from schema)

Mekai has two translation layers plus vocabulary and region persistence:

1. `translation_history`

- Personal translations done by a reader
- Used for user translation replay

2. `chapter_translations`

- Shared translations created by translators
- Used for public manga translation overlays

3. `word_vault`

- User vocabulary learning system
- Stores: original, translated, romaji

4. Region-based OCR system

- Uses `region` JSONB, `region_hash` TEXT, `page_index` INT
- This is how Mekai remembers speech bubble locations
