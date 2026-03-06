## Coding Agent Initialization Prompt (Mekai Project)

### Project Context

The project is Mekai, a manga reader + translator platform.

Architecture stack:

- Frontend: Next.js (App Router) + TypeScript
- Backend: Supabase (Postgres + Storage + Auth)
- Deployment: Vercel
- Content format: Manga chapters uploaded as CBZ (zip of images)

Goal of the system:

- Allow translators to OCR Japanese manga panels
- Translate them
- Save translations in the database
- Render overlay translations on speech bubbles during reading

The previous implementation used:

- tesseract.js
- mymemory translation

These have been removed because they were unreliable.

We are now building a more accurate OCR pipeline focused on manga.

### Important Rules for This Project

Follow these rules strictly.

#### 1. Avoid Redundant Logic

If similar logic exists with different naming conventions, refactor instead of duplicating code.

Example:

Bad:

- `translateText()`
- `performTranslation()`
- `doTranslate()`

Good:

- `translateText()`

Reuse existing utilities whenever possible.

#### 2. Optimize for Vercel

Because this runs on Vercel serverless, do NOT introduce:

- Heavy Python runtimes
- Models >100MB
- Long cold start processes

OCR must run through:

- API services
- Lightweight inference
- External workers

#### 3. Maintain Database Compatibility

The project already has the following Supabase schema and it must remain compatible.

Key table used for OCR results:

- `chapter_translations`

Important fields:

| Column | Purpose |
|---|---|
| `chapter_id` | Chapter reference |
| `page_index` | Page number |
| `region` | Speech bubble coordinates |
| `region_hash` | Unique region id |
| `ocr_text` | Raw OCR output |
| `translated` | Translated text |
| `romaji` | Optional romaji |

The OCR system must generate:

- `region`
- `region_hash`
- `ocr_text`
- `translated`

#### Storage Schema Context (`storage.sql`)

```sql
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE storage.buckets (
  id text NOT NULL,
  name text NOT NULL,
  owner uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  public boolean DEFAULT false,
  avif_autodetection boolean DEFAULT false,
  file_size_limit bigint,
  allowed_mime_types ARRAY,
  owner_id text,
  type USER-DEFINED NOT NULL DEFAULT 'STANDARD'::storage.buckettype,
  CONSTRAINT buckets_pkey PRIMARY KEY (id)
);
CREATE TABLE storage.buckets_analytics (
  name text NOT NULL,
  type USER-DEFINED NOT NULL DEFAULT 'ANALYTICS'::storage.buckettype,
  format text NOT NULL DEFAULT 'ICEBERG'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  deleted_at timestamp with time zone,
  CONSTRAINT buckets_analytics_pkey PRIMARY KEY (id)
);
CREATE TABLE storage.buckets_vectors (
  id text NOT NULL,
  type USER-DEFINED NOT NULL DEFAULT 'VECTOR'::storage.buckettype,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT buckets_vectors_pkey PRIMARY KEY (id)
);
CREATE TABLE storage.migrations (
  id integer NOT NULL,
  name character varying NOT NULL UNIQUE,
  hash character varying NOT NULL,
  executed_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT migrations_pkey PRIMARY KEY (id)
);
CREATE TABLE storage.objects (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  bucket_id text,
  name text,
  owner uuid,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  last_accessed_at timestamp with time zone DEFAULT now(),
  metadata jsonb,
  path_tokens ARRAY DEFAULT string_to_array(name, '/'::text),
  version text,
  owner_id text,
  user_metadata jsonb,
  CONSTRAINT objects_pkey PRIMARY KEY (id),
  CONSTRAINT objects_bucketId_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id)
);
CREATE TABLE storage.s3_multipart_uploads (
  id text NOT NULL,
  in_progress_size bigint NOT NULL DEFAULT 0,
  upload_signature text NOT NULL,
  bucket_id text NOT NULL,
  key text NOT NULL,
  version text NOT NULL,
  owner_id text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_metadata jsonb,
  CONSTRAINT s3_multipart_uploads_pkey PRIMARY KEY (id),
  CONSTRAINT s3_multipart_uploads_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id)
);
CREATE TABLE storage.s3_multipart_uploads_parts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  upload_id text NOT NULL,
  size bigint NOT NULL DEFAULT 0,
  part_number integer NOT NULL,
  bucket_id text NOT NULL,
  key text NOT NULL,
  etag text NOT NULL,
  owner_id text,
  version text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT s3_multipart_uploads_parts_pkey PRIMARY KEY (id),
  CONSTRAINT s3_multipart_uploads_parts_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES storage.s3_multipart_uploads(id),
  CONSTRAINT s3_multipart_uploads_parts_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets(id)
);
CREATE TABLE storage.vector_indexes (
  id text NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  bucket_id text NOT NULL,
  data_type text NOT NULL,
  dimension integer NOT NULL,
  distance_metric text NOT NULL,
  metadata_configuration jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vector_indexes_pkey PRIMARY KEY (id),
  CONSTRAINT vector_indexes_bucket_id_fkey FOREIGN KEY (bucket_id) REFERENCES storage.buckets_vectors(id)
);
```

#### 4. Reader Rendering Requirement

Reader must support:

- Overlay translated text
- Positioned using region coordinates

Meaning the OCR system must detect text regions accurately.

#### 5. Console Logging

Remove unnecessary noisy logs.

Only allow logs for:

- OCR processing
- Translation processing
- Error debugging

### Current Problem

The current OCR pipeline is not accurate enough for manga.

Problems include:

- Missing text bubbles
- Overlapping translations
- Detection in empty regions
- Inaccurate bounding boxes

### New Architecture Direction

We are improving OCR accuracy using a 3-stage pipeline.

#### Stage 1 - Text Bubble Detection

Detect speech bubbles / text regions.

Possible tools:

- Roboflow API
- YOLO speech bubble detection
- Pre-trained manga bubble models

Output:

- Bounding boxes

#### Stage 2 - OCR Recognition

Run OCR only on detected text regions.

Recommended models:

Option A (Preferred)

- MangaOCR

Option B (Lightweight alternative)

- PaddleOCR optimized for Japanese

Requirements:

Must support:

- Vertical text
- Furigana
- Stylized manga fonts

#### Stage 3 - Translation

Translate recognized Japanese text.

Possible translation engines:

- DeepL API
- Google Translate API
- LibreTranslate (fallback)

Output:

- Translated text
- Romaji (optional)

### Additional Validation Layer

OCR must implement the following checks.

#### Empty Region Protection

If OCR returns:

- Empty string
- Or low confidence

The system must discard the region.

#### Duplicate Region Prevention

Before inserting translation rows:

Check if a row exists with:

- `chapter_id`
- `page_index`
- `region_hash`

If exists:

- UPDATE instead of INSERT

#### Translation Overlay Protection

Prevent overlapping translated text.

If two bounding boxes overlap significantly:

- Merge or discard the weaker detection

### Required Implementation Tasks

#### Task 1 - OCR Service Module

Create a module:

- `/lib/ocr/mangaOcrService.ts`

Responsibilities:

- Accept image input
- Detect speech bubbles
- Run OCR
- Return structured text regions

Output format:

```ts
{
  regions: [
    {
      region: { x, y, width, height },
      region_hash: string,
      ocr_text: string,
      confidence: number
    }
  ]
}
```

#### Task 2 - Translation Service

Create:

- `/lib/translation/translateService.ts`

Responsibilities:

- Translate OCR output

Return:

- `translated`
- `romaji`

#### Task 3 - Database Integration

Create helper:

- `/lib/db/saveChapterTranslations.ts`

Responsibilities:

- Check duplicate region
- Insert or update chapter_translations

#### Task 4 - Reader Overlay Rendering

Update the reader component so that translations are rendered using:

- `region.x`
- `region.y`
- `region.width`
- `region.height`

Overlay must be responsive.

#### Task 5 - OCR Region Validation

Add logic to prevent OCR processing when:

- User drag-selects empty area
- Bounding box area too small
- No detected text

#### Task 6 - Performance Optimization

Ensure OCR pipeline:

- Processes per region instead of full page
- Caches OCR results
- Avoids redundant translation calls

#### Task 7 - Accuracy Improvements

Add support for:

- Vertical Japanese text
- Furigana
- Stylized fonts

Use preprocessing:

- Grayscale
- Contrast normalization
- Sharpen filter

Before OCR.

### Deliverables

The agent must output:

- New OCR service implementation
- Translation service
- Database integration helper
- Reader overlay improvements
- Validation logic

All code must be TypeScript compatible with Next.js.

### Important Constraint

The agent must:

- Analyze existing code
- Detect duplicate functionality
- Refactor when necessary
- Avoid introducing redundant modules

If something conflicts with existing logic:

- Modify existing implementation instead of creating a new one

### Final Goal

A high-accuracy manga OCR + translation pipeline that:

- Works within Vercel limitations
- Integrates with Supabase
- Correctly renders translated speech bubbles

### One More Thing (Important for Your Project)

Based on earlier research, a practical stack is likely:

- Roboflow -> Speech Bubble Detection
- PaddleOCR -> Text Recognition
- DeepL -> Translation

Not manga-ocr directly because:

| Issue | Reason |
|---|---|
| Model size | ~444MB |
| Runtime | Python required |
| Vercel | Not suitable |

So the agent should prefer PaddleOCR-style API implementations.
