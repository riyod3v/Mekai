import { toRomaji as wanaRomaji } from 'wanakana';

/**
 * Convert a Japanese string (kana / kanji) to Romaji.
 * Falls back gracefully to the original text on any error.
 */
export function toRomaji(jp: string): string {
  try {
    return wanaRomaji(jp);
  } catch {
    return jp;
  }
}
