-- ─────────────────────────────────────────────────────────────
-- translation_history table
-- Run this once in the Supabase SQL editor.
-- ─────────────────────────────────────────────────────────────

-- Enable uuid generation if not already active
create extension if not exists "uuid-ossp";

-- ─── Table ───────────────────────────────────────────────────

create table if not exists public.translation_history (
  id          uuid        primary key default uuid_generate_v4(),
  user_id     uuid        not null default auth.uid()
                          references public.profiles (id) on delete cascade,
  chapter_id  uuid        not null
                          references public.chapters (id) on delete cascade,
  manga_id    uuid        not null
                          references public.manga (id) on delete cascade,
  page_index  integer     not null check (page_index >= 0),
  region_x    float       not null check (region_x between 0 and 1),
  region_y    float       not null check (region_y between 0 and 1),
  region_w    float       not null check (region_w between 0 and 1),
  region_h    float       not null check (region_h between 0 and 1),
  ocr_text    text        not null,
  translated  text        not null,
  romaji      text,
  created_at  timestamptz not null default now()
);

-- Index for the most common query pattern (history by chapter, newest first)
create index if not exists translation_history_chapter_id_idx
  on public.translation_history (chapter_id, created_at desc);

-- Index for per-user lookups
create index if not exists translation_history_user_id_idx
  on public.translation_history (user_id);

-- ─── Row Level Security ───────────────────────────────────────

alter table public.translation_history enable row level security;

-- Users can only read their own history
create policy "Users can view own translation history"
  on public.translation_history
  for select
  using (auth.uid() = user_id);

-- Users can only insert rows for themselves
create policy "Users can insert own translation history"
  on public.translation_history
  for insert
  with check (auth.uid() = user_id);

-- Users can only delete their own rows
create policy "Users can delete own translation history"
  on public.translation_history
  for delete
  using (auth.uid() = user_id);
