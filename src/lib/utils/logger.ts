/**
 * Mekai — centralised client-side logger.
 *
 * Rules:
 *  • All output is suppressed in production builds (`import.meta.env.PROD`).
 *  • In development every call passes through to the native console so that
 *    hot-reload debugging still works as expected.
 *  • `logger.error` / `logger.warn` are safe to call anywhere — they never
 *    expose stack-traces or internal messages to end users; those details stay
 *    in the browser DevTools only (dev) or are swallowed entirely (prod).
 *
 * Usage:
 *   import { logger } from '@/lib/utils/logger';
 *   logger.info('[module] doing thing');
 *   logger.warn('[module] unusual state', someValue);
 *   logger.error('[module] recoverable error', err);
 */

const IS_DEV = import.meta.env.DEV;

function _log(level: 'log' | 'info' | 'warn' | 'error', ...args: unknown[]): void {
  if (!IS_DEV) return;
  // eslint-disable-next-line no-console
  console[level](...args);
}

export const logger = {
  /** General-purpose informational message (dev only). */
  log:   (...args: unknown[]) => _log('log',   ...args),
  info:  (...args: unknown[]) => _log('info',  ...args),
  warn:  (...args: unknown[]) => _log('warn',  ...args),
  /** Error detail (dev only). Never forwarded to the user. */
  error: (...args: unknown[]) => _log('error', ...args),
} as const;
