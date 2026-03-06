## Mekai AI Coding Rules

Rules for AI coding agents working on the Mekai project.

These rules exist to prevent architectural corruption, duplicate systems, and wasted prompts.

## Prompt Efficiency Rule

Coding agents must follow a single-task execution model.

Each prompt must complete one clearly defined task only.

Example:

GOOD:

Task: Implement OCR request handler in `src/services/ocr.ts`.

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
- TanStack Query

Backend:

- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Supabase Realtime

OCR service:

- Python microservice

## Forbidden Additions

Agents must NOT add:

- Tesseract.js
- MyMemory API
- Apify OCR actor
- Serverless OCR

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

- chapter_translations

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

All API communication must be implemented inside:

`src/services/`

Examples:

- `src/services/ocr.ts`
- `src/services/translation.ts`
- `src/services/manga.ts`
- `src/services/chapters.ts`

Components must never directly call APIs.

## Component Rules

UI logic must stay inside:

`src/components/`

Business logic must stay inside:

`src/services/`

Shared utilities go in:

`src/lib/`

## Supabase Access Rules

Supabase client must only be created in:

`src/lib/supabase.ts`

No duplicate clients allowed.

## Storage Rules

Buckets:

- covers
- pages
- ocr-temp

Agents must not create new buckets without explicit instruction.

## OCR Image Handling

OCR images must:

- Be cropped in browser
- Be upscaled 2x
- Be uploaded to ocr-temp
- Be processed by OCR API

OCR must never run in browser or Vercel functions.

## Security Requirements

Agents must preserve:

- Supabase RLS compatibility
- Owner-only Word Vault access
- Authenticated uploads
- Signed URL usage for OCR images

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
