// ─────────────────────────────────────────────────────────────
// Mekai – Shared TypeScript types
// ─────────────────────────────────────────────────────────────

export type Role = 'reader' | 'translator';

export interface Profile {
  id: string;
  username: string;
  role: Role;
  avatar_url: string | null;
  /** Fetched from auth.users at runtime — not stored in the profiles table. */
  email?: string;
  created_at: string;
  updated_at: string;
}

export type Visibility = 'shared' | 'private';

export interface Manga {
  id: string;
  title: string;
  description: string | null;
  cover_url: string | null;
  visibility: Visibility;
  owner_id: string;
  genres?: string[];
  created_at: string;
  updated_at: string;
  /** Joined field from chapters count (optional) */
  chapter_count?: number;
}

export interface Chapter {
  id: string;
  manga_id: string;
  chapter_number: number;
  title: string | null;
  cbz_url: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
}

export interface Page {
  id: string;
  chapter_id: string;
  page_number: number;
  image_url: string;
  created_at: string;
}

/** Alias for Page matching schema naming convention */
export type PageRow = Page;

/** A bounding box described as fractions (0–1) of image dimensions */
export interface RegionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ─── Translation History (per-user private) ──────────────────

/** Row shape returned from `public.translation_history`. */
export interface TranslationHistoryRow {
  id: string;
  user_id: string;
  chapter_id: string;
  page_index: number;
  /** JSONB column stored as { x, y, w, h } */
  region: RegionBox;
  region_hash: string;
  ocr_text: string;
  translated: string;
  romaji: string | null;
  created_at: string;
}

/** Params for inserting a new translation_history row. */
export interface CreateTranslationHistoryInput {
  chapter_id: string;
  page_index: number;
  region: RegionBox;
  region_hash: string;
  ocr_text: string;
  translated: string;
  romaji?: string | null;
}

// ─── Chapter Translations (published, visible to readers) ────

/** Row shape returned from `public.chapter_translations`. */
export interface ChapterTranslationRow {
  id: string;
  chapter_id: string;
  page_index: number;
  region: RegionBox;
  region_hash: string;
  ocr_text: string;
  translated: string;
  romaji: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface UpsertChapterTranslationInput {
  chapter_id: string;
  page_index: number;
  region: RegionBox;
  region_hash: string;
  ocr_text: string;
  translated: string;
  romaji?: string | null;
}

// ─── Word Vault (per-user bookmarks) ─────────────────────────

export interface WordVaultEntry {
  id: string;
  user_id: string;
  chapter_id: string | null;
  page_index: number | null;
  region: RegionBox | null;
  region_hash: string | null;
  original: string;
  translated: string;
  romaji: string | null;
  created_at: string;
}

export interface CreateWordVaultInput {
  chapter_id?: string | null;
  page_index?: number | null;
  region?: RegionBox | null;
  region_hash?: string | null;
  original: string;
  translated: string;
  romaji?: string | null;
}

/** Alias for backward-compat */
export type WordVaultRow = WordVaultEntry;

// ─── Reading Progress ────────────────────────────────────────

export interface ReadingProgressRow {
  user_id: string;
  chapter_id: string;
  last_page_index: number;
  updated_at: string;
}

// ─── OCR / Reader ────────────────────────────────────────────

export type ReadingMode = 'page' | 'scroll';

/** Compute a stable hash key for a region (used in chapter_translations unique constraint). */
export function regionHash(r: RegionBox): string {
  return `${r.x.toFixed(4)}-${r.y.toFixed(4)}-${r.w.toFixed(4)}-${r.h.toFixed(4)}`;
}

// ─── Forms ───────────────────────────────────────────────────

export interface MangaFormData {
  title: string;
  description: string;
  visibility: Visibility;
  cover: File | null;
  genres?: string[];
}

export interface ChapterFormData {
  chapterNumber: number;
  title: string;
  cbzFile: File;
}
