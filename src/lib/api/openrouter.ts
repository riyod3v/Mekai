/**
 * OpenRouter AI integration for Mekai.
 * 
 * Provides AI-powered explanations for Japanese sentences and vocabulary.
 * Uses OpenRouter API to access various LLM models.
 * 
 * Configuration:
 *   VITE_OPENROUTER_API_KEY - Required API key
 *   VITE_OPENROUTER_MODEL   - Optional model override (default: meta-llama/llama-3-8b-instruct)
 */

import { logger } from '@/lib/utils/logger';

const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY as string | undefined;
const MODEL = (import.meta.env.VITE_OPENROUTER_MODEL as string | undefined) ?? 'meta-llama/llama-3-8b-instruct';
const API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const _explanationCache = new Map<string, string>();

/**
 * Call OpenRouter chat completion API with the given messages.
 */
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
    logger.error('[OpenRouter] API call failed:', err);
    throw err;
  }
}

/**
 * Generate an AI explanation for a Japanese sentence.
 * 
 * Explains grammar, vocabulary, and meaning in a learner-friendly way.
 * Results are cached in memory to avoid redundant API calls.
 * 
 * @param text - Japanese sentence to explain
 * @returns AI-generated explanation
 */
export async function explainJapaneseSentence(text: string): Promise<string> {
  if (!text.trim()) {
    throw new Error('No text provided for explanation');
  }

  const cached = _explanationCache.get(text);
  if (cached) {
    logger.info('[OpenRouter] Using cached explanation for:', text);
    return cached;
  }

  logger.info('[OpenRouter] Requesting explanation for:', text);

  const messages = [
    {
      role: 'system',
      content: 'You are a Japanese language tutor explaining manga dialogue. Provide clear, concise explanations suitable for learners. Break down grammar, vocabulary, and meaning.',
    },
    {
      role: 'user',
      content: `Explain this Japanese sentence for a learner: ${text}`,
    },
  ];

  const explanation = await callOpenRouter(messages);
  
  _explanationCache.set(text, explanation);
  
  return explanation;
}

/**
 * Check if OpenRouter is configured and available.
 */
export function isOpenRouterConfigured(): boolean {
  return !!API_KEY;
}
