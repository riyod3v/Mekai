import { toRomaji as wanaRomaji } from 'wanakana';

/**
 * Convert a Japanese string (kana / kanji) to Romaji.
 * - Empty input → returns empty string.
 * - Falls back gracefully to the original text on any error.
 */
export function toRomaji(text: string): string {
  if (!text.trim()) return '';
  try {
    return wanaRomaji(text);
  } catch {
    return text;
  }
}
