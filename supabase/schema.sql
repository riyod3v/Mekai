-- ============================================================
-- MEKAI – Supabase SQL Schema + RLS Policies
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor)
-- ============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. Extensions
-- ─────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";


-- ─────────────────────────────────────────────────────────────
-- 1. Profiles  (extends auth.users)
-- ─────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  username    text not null,
  role        text not null check (role in ('reader', 'translator')),
  avatar_url  text,
  created_at  timestamptz default now()
);

alter table public.profiles enable row level security;

-- Anyone can read any profile (for translator names etc.)
create policy "profiles: public read"
  on public.profiles for select
  using (true);

-- Users can insert/update only their own profile
create policy "profiles: owner modify"
  on public.profiles for all
  using  (auth.uid() = id)
  with check (auth.uid() = id);


-- ─────────────────────────────────────────────────────────────
-- 2. Manga
-- ─────────────────────────────────────────────────────────────
create table if not exists public.manga (
  id            uuid primary key default uuid_generate_v4(),
  title         text not null,
  description   text,
  cover_url     text,
  visibility    text not null default 'shared' check (visibility in ('shared', 'private')),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.manga enable row level security;

-- Shared manga: all authenticated users can read
create policy "manga: shared read"
  on public.manga for select
  using (
    visibility = 'shared' and auth.uid() is not null
  );

-- Private manga: only the owner can read
create policy "manga: private owner read"
  on public.manga for select
  using (
    visibility = 'private' and auth.uid() = owner_id
  );

-- Translators can insert shared manga (owned by themselves)
create policy "manga: translator insert"
  on public.manga for insert
  with check (
    auth.uid() = owner_id
    and exists (
      select 1 from public.profiles
      where id = auth.uid() and role = 'translator'
    )
    and visibility = 'shared'
  );

-- Readers can insert private manga (owned by themselves)
create policy "manga: reader private insert"
  on public.manga for insert
  with check (
    auth.uid() = owner_id
    and visibility = 'private'
  );

-- Translators can update their own shared manga
create policy "manga: translator update own"
  on public.manga for update
  using (
    auth.uid() = owner_id
    and visibility = 'shared'
  )
  with check (auth.uid() = owner_id);

-- Readers can update their own private manga
create policy "manga: reader private update own"
  on public.manga for update
  using (
    auth.uid() = owner_id
    and visibility = 'private'
  )
  with check (auth.uid() = owner_id);

-- Owners can delete their own manga
create policy "manga: owner delete"
  on public.manga for delete
  using (auth.uid() = owner_id);


-- ─────────────────────────────────────────────────────────────
-- 3. Chapters
-- ─────────────────────────────────────────────────────────────
create table if not exists public.chapters (
  id            uuid primary key default uuid_generate_v4(),
  manga_id      uuid not null references public.manga(id) on delete cascade,
  chapter_number int not null,
  title         text,
  uploaded_by   uuid not null references auth.users(id),
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  unique (manga_id, chapter_number)
);

alter table public.chapters enable row level security;

-- Any authenticated user can read chapters of manga they can access
create policy "chapters: read if manga accessible"
  on public.chapters for select
  using (
    exists (
      select 1 from public.manga m
      where m.id = chapters.manga_id
        and (
          (m.visibility = 'shared' and auth.uid() is not null)
          or (m.visibility = 'private' and m.owner_id = auth.uid())
        )
    )
  );

-- Translators can insert chapters for shared manga they own
create policy "chapters: translator insert"
  on public.chapters for insert
  with check (
    auth.uid() = uploaded_by
    and exists (
      select 1 from public.manga m
      where m.id = chapters.manga_id
        and m.visibility = 'shared'
        and m.owner_id = auth.uid()
    )
    and exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'translator'
    )
  );

-- Readers can insert chapters for their own private manga
create policy "chapters: reader private insert"
  on public.chapters for insert
  with check (
    auth.uid() = uploaded_by
    and exists (
      select 1 from public.manga m
      where m.id = chapters.manga_id
        and m.visibility = 'private'
        and m.owner_id = auth.uid()
    )
  );

-- Uploader can update their chapter
create policy "chapters: uploader update"
  on public.chapters for update
  using (auth.uid() = uploaded_by)
  with check (auth.uid() = uploaded_by);

-- Uploader can delete their chapter
create policy "chapters: uploader delete"
  on public.chapters for delete
  using (auth.uid() = uploaded_by);


-- ─────────────────────────────────────────────────────────────
-- 4. Pages
-- ─────────────────────────────────────────────────────────────
create table if not exists public.pages (
  id            uuid primary key default uuid_generate_v4(),
  chapter_id    uuid not null references public.chapters(id) on delete cascade,
  page_number   int not null,
  image_url     text not null,
  created_at    timestamptz default now(),
  unique (chapter_id, page_number)
);

alter table public.pages enable row level security;

-- Any authenticated user can read pages of accessible chapters
create policy "pages: read if chapter accessible"
  on public.pages for select
  using (
    exists (
      select 1 from public.chapters ch
      join public.manga m on m.id = ch.manga_id
      where ch.id = pages.chapter_id
        and (
          (m.visibility = 'shared' and auth.uid() is not null)
          or (m.visibility = 'private' and m.owner_id = auth.uid())
        )
    )
  );

-- Chapter uploader or manga owner can insert pages
create policy "pages: uploader insert"
  on public.pages for insert
  with check (
    exists (
      select 1 from public.chapters ch
      where ch.id = pages.chapter_id
        and ch.uploaded_by = auth.uid()
    )
  );

-- Uploader can delete pages
create policy "pages: uploader delete"
  on public.pages for delete
  using (
    exists (
      select 1 from public.chapters ch
      where ch.id = pages.chapter_id
        and ch.uploaded_by = auth.uid()
    )
  );


-- ─────────────────────────────────────────────────────────────
-- 5. Translation History
-- ─────────────────────────────────────────────────────────────
create table if not exists public.translation_history (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  page_id       uuid not null references public.pages(id) on delete cascade,
  -- Bounding box of the selected region (percentage-based, 0.0 – 1.0)
  region_x      float not null,
  region_y      float not null,
  region_w      float not null,
  region_h      float not null,
  ocr_text      text not null,
  translated    text,
  romaji        text,
  visible       boolean default true,
  created_at    timestamptz default now()
);

alter table public.translation_history enable row level security;

-- Users can only read their own translation history
create policy "translation_history: owner read"
  on public.translation_history for select
  using (auth.uid() = user_id);

-- Users can insert their own entries
create policy "translation_history: owner insert"
  on public.translation_history for insert
  with check (auth.uid() = user_id);

-- Users can update their own entries (e.g. toggle visibility)
create policy "translation_history: owner update"
  on public.translation_history for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Users can delete their own entries
create policy "translation_history: owner delete"
  on public.translation_history for delete
  using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 6. Word Vault
-- ─────────────────────────────────────────────────────────────
create table if not exists public.word_vault (
  id            uuid primary key default uuid_generate_v4(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  original      text not null,
  translated    text not null,
  romaji        text,
  source_page_id uuid references public.pages(id) on delete set null,
  created_at    timestamptz default now()
);

alter table public.word_vault enable row level security;

-- Users can only access their own vault
create policy "word_vault: owner read"
  on public.word_vault for select
  using (auth.uid() = user_id);

create policy "word_vault: owner insert"
  on public.word_vault for insert
  with check (auth.uid() = user_id);

create policy "word_vault: owner delete"
  on public.word_vault for delete
  using (auth.uid() = user_id);


-- ─────────────────────────────────────────────────────────────
-- 7. Storage Buckets
-- ─────────────────────────────────────────────────────────────
-- Run these in Supabase Dashboard → Storage, or via SQL:

-- Bucket for manga covers (public read)
insert into storage.buckets (id, name, public)
values ('covers', 'covers', true)
on conflict do nothing;

-- Bucket for manga pages (public read – access is controlled by DB RLS)
insert into storage.buckets (id, name, public)
values ('pages', 'pages', true)
on conflict do nothing;

-- Storage RLS for covers bucket
create policy "covers: public read"
  on storage.objects for select
  using (bucket_id = 'covers');

create policy "covers: auth upload"
  on storage.objects for insert
  with check (bucket_id = 'covers' and auth.uid() is not null);

create policy "covers: owner delete"
  on storage.objects for delete
  using (bucket_id = 'covers' and auth.uid()::text = (storage.foldername(name))[1]);

-- Storage RLS for pages bucket
create policy "pages: public read"
  on storage.objects for select
  using (bucket_id = 'pages');

create policy "pages: auth upload"
  on storage.objects for insert
  with check (bucket_id = 'pages' and auth.uid() is not null);

create policy "pages: owner delete"
  on storage.objects for delete
  using (bucket_id = 'pages' and auth.uid()::text = (storage.foldername(name))[1]);


-- ─────────────────────────────────────────────────────────────
-- 8. Realtime
-- ─────────────────────────────────────────────────────────────
-- Enable realtime for manga and chapters tables so Reader Dashboard
-- receives live updates when a translator uploads/updates content.
-- In Supabase Dashboard → Database → Replication → Tables, enable
-- manga and chapters, OR run:

alter publication supabase_realtime add table public.manga;
alter publication supabase_realtime add table public.chapters;


-- ─────────────────────────────────────────────────────────────
-- 9. Auto-update updated_at trigger
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger manga_updated_at
  before update on public.manga
  for each row execute procedure public.handle_updated_at();

create trigger chapters_updated_at
  before update on public.chapters
  for each row execute procedure public.handle_updated_at();


-- ─────────────────────────────────────────────────────────────
-- 10. Auto-create profile on signup trigger
-- ─────────────────────────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, username, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data->>'role', 'reader')
  );
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ─────────────────────────────────────────────────────────────
-- Sample / Demo seed data (optional – comment out if not needed)
-- ─────────────────────────────────────────────────────────────
-- Uncomment and adjust UUIDs after creating accounts via auth UI
--
-- insert into public.manga (id, title, description, cover_url, visibility, owner_id)
-- values
--   ('11111111-0000-0000-0000-000000000001',
--    'Demo Manga Alpha',
--    'A placeholder shared manga for demonstration.',
--    'https://picsum.photos/seed/manga1/300/420',
--    'shared',
--    '<your-translator-user-id>'
--   );
