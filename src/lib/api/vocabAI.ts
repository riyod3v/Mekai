/**
 * AI-powered vocabulary expansion for Word Vault.
 * 
 * Generates detailed explanations for Japanese words including:
 *   - Meaning and usage
 *   - Grammar notes
 *   - Example sentences with romaji
 */

import { logger } from '@/lib/utils/logger';

const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
const MODEL = (import.meta.env.VITE_OPENROUTER_MODEL as string | undefined) ?? 'mistralai/mistral-7b-instruct';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const _vocabCache = new Map<string, string>();

async function callOpenRouter(messages: Array<{ role: string; content: string }>): Promise<string> {
  if (!API_KEY) {
    throw new Error('OpenRouter API key not configured. Set VITE_OPENROUTER_API_KEY in your environment.');
  }

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`OpenRouter API error: ${res.status}${detail ? ` — ${detail}` : ''}`);
    }

    const json = await res.json();
    const content = json.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No response content from OpenRouter');
    }

    return content.trim();
  } catch (err) {
    logger.error('[VocabAI] API call failed:', err);
    throw err;
  }
}

/**
 * Generate a comprehensive explanation for a Japanese word.
 * 
 * Includes meaning, grammar notes, example sentences, and romaji.
 * Results are cached in memory to avoid redundant API calls.
 * 
 * @param word - Japanese word or phrase to explain
 * @returns AI-generated vocabulary explanation
 */
export async function generateWordExplanation(word: string): Promise<string> {
  if (!word.trim()) {
    throw new Error('No word provided for explanation');
  }

  const cached = _vocabCache.get(word);
  if (cached) {
    logger.info('[VocabAI] Using cached explanation for:', word);
    return cached;
  }

  logger.info('[VocabAI] Requesting explanation for:', word);

  const messages = [
    {
      role: 'system',
      content: 'You are a Japanese vocabulary tutor. Provide clear, structured explanations for beginners.',
    },
    {
      role: 'user',
      content: `Explain this Japanese vocabulary word for a beginner. Provide:
1. Meaning
2. Grammar notes (if applicable)
3. 2-3 example sentences with English translations
4. Romaji for pronunciation

Word: ${word}`,
    },
  ];

  const explanation = await callOpenRouter(messages);
  
  _vocabCache.set(word, explanation);
  
  return explanation;
}

/**
 * Check if vocabulary AI is configured and available.
 */
export function isVocabAIConfigured(): boolean {
  return !!API_KEY;
}
