/**
 * Allowlist of static paths users are permitted to be redirected to
 * after authenticating. Only relative same-origin paths are accepted.
 */
const STATIC_ALLOWED_PATHS = new Set([
  '/',
  '/reader',
  '/translator',
  '/settings',
  '/word-vault',
]);

/**
 * Dynamic path patterns that are also permitted.
 * UUIDs and slug-style IDs are accepted for manga/chapter routes.
 */
const DYNAMIC_ALLOWED_PATTERNS: RegExp[] = [
  /^\/manga\/[a-zA-Z0-9_-]+$/,
  /^\/read\/[a-zA-Z0-9_-]+$/,
];

/**
 * Returns true when `path` is a safe, allowlisted redirect destination.
 * - Must be a relative path (starts with `/`, not `//`).
 * - Query strings and hash fragments are stripped before comparison.
 */
export function isAllowedRedirectPath(path: unknown): path is string {
  if (!path || typeof path !== 'string') return false;
  // Reject protocol-relative and absolute URLs
  if (!path.startsWith('/') || path.startsWith('//')) return false;
  // Strip query string and hash for the allowlist lookup
  const clean = path.split('?')[0].split('#')[0];
  if (STATIC_ALLOWED_PATHS.has(clean)) return true;
  return DYNAMIC_ALLOWED_PATTERNS.some((p) => p.test(clean));
}

/**
 * Returns `path` if it passes the allowlist, or `fallback` otherwise.
 */
export function getSafeRedirectPath(
  path: string | null | undefined,
  fallback: string = '/'
): string {
  return isAllowedRedirectPath(path) ? path : fallback;
}
