/** Tiny crypto.randomUUID wrapper (supported in all modern browsers) */
export function v4(): string {
  return crypto.randomUUID();
}
