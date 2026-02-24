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

// ─── DB row aliases (match schema column names exactly) ──────

/** Alias for Page matching schema naming convention */
export type PageRow = Page;

/** Alias for TranslationHistory matching schema naming convention */
export type TranslationHistoryRow = TranslationHistory;

/** Alias for WordVaultEntry matching schema naming convention */
export type WordVaultRow = WordVaultEntry;

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
  // Joined field from chapters count (optional)
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

/** A bounding box described as fractions (0–1) of image dimensions */
export interface RegionBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TranslationHistory {
  id: string;
  user_id: string;
  page_id: string;
  region_x: number;
  region_y: number;
  region_w: number;
  region_h: number;
  ocr_text: string;
  translated: string | null;
  romaji: string | null;
  visible: boolean;
  created_at: string;
}

export interface WordVaultEntry {
  id: string;
  user_id: string;
  original: string;
  translated: string;
  romaji: string | null;
  source_page_id: string | null;
  created_at: string;
}

// ─── OCR / Reader ────────────────────────────────────────────

/** Draft OCR result before saving */
export interface OcrResult {
  text: string;
  translated: string | null;
  romaji: string | null;
  region: RegionBox;
  /** Absolute pixel coordinates on the image element */
  absBox: { left: number; top: number; width: number; height: number };
}

export type ReadingMode = 'page' | 'scroll';

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
