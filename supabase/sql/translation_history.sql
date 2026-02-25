-- ──────────────────────────────────────────────────────────────────────────────
-- translation_history — idempotent migration
-- Safe to re-run; DROP TABLE IF EXISTS ... CASCADE handles any prior version.
-- ──────────────────────────────────────────────────────────────────────────────

-- 0. Ensure the uuid-ossp extension exists
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA extensions;

-- 1. Drop table and all dependent objects (old indexes, policies, etc.)
DROP TABLE IF EXISTS public.translation_history CASCADE;

-- 2. Recreate table with final schema
CREATE TABLE public.translation_history (
  id          uuid          PRIMARY KEY DEFAULT extensions.uuid_generate_v4(),
  user_id     uuid          NOT NULL REFERENCES public.profiles(id)  ON DELETE CASCADE,
  manga_id    uuid          NOT NULL REFERENCES public.manga(id)      ON DELETE CASCADE,
  chapter_id  uuid          NOT NULL REFERENCES public.chapters(id)   ON DELETE CASCADE,
  -- 0-based page index matching the CBZ image array position
  page_index  int           NOT NULL CHECK (page_index >= 0),
  -- Normalised bounding box (all values 0..1)
  region_x    float         NOT NULL CHECK (region_x >= 0 AND region_x <= 1),
  region_y    float         NOT NULL CHECK (region_y >= 0 AND region_y <= 1),
  region_w    float         NOT NULL CHECK (region_w  > 0 AND region_w  <= 1),
  region_h    float         NOT NULL CHECK (region_h  > 0 AND region_h  <= 1),
  ocr_text    text          NOT NULL,
  translated  text          NOT NULL,
  romaji      text          NULL,
  created_at  timestamptz   NOT NULL DEFAULT now()
);

-- 3. Indexes
CREATE INDEX translation_history_user_created_idx
  ON public.translation_history (user_id, created_at DESC);

CREATE INDEX translation_history_chapter_idx
  ON public.translation_history (chapter_id, page_index);

-- 4. Row-Level Security
ALTER TABLE public.translation_history ENABLE ROW LEVEL SECURITY;

-- 5. Policies (DROP each by name first so re-runs are safe after the CASCADE above)
CREATE POLICY "translation_history: owner select"
  ON public.translation_history FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "translation_history: owner insert"
  ON public.translation_history FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "translation_history: owner delete"
  ON public.translation_history FOR DELETE
  USING (auth.uid() = user_id);
