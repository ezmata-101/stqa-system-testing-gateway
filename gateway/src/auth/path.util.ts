/**
 * Internal headers that students must never be able to set themselves
 * (spec section 9). Stripped from every incoming request before any
 * further processing.
 */
export const UNTRUSTED_INTERNAL_HEADERS = [
  'x-stqa-context',
  'x-stqa-team-id',
  'x-stqa-student-id',
  'x-stqa-database',
  'x-stqa-offering-id',
  'x-stqa-request-id',
];

/**
 * Extracts the offering code from a `/api/{offering-code}/...` path.
 * Returns undefined for paths that don't follow this shape (e.g. `/_lab/*`,
 * `/admin/*`, `/health`), which resolve their offering from the credential
 * instead.
 */
export function extractOfferingCodeFromPath(path: string): string | undefined {
  const match = /^\/api\/([^/]+)(\/.*)?$/.exec(path);
  return match ? decodeURIComponent(match[1]) : undefined;
}

/** Strips the offering prefix, returning the path to forward to the backend. */
export function stripOfferingPrefix(path: string, offeringCode: string): string {
  const prefix = `/api/${offeringCode}`;
  const rest = path.slice(prefix.length);
  return rest === '' ? '/' : rest;
}
