const REDACTED = '***REDACTED***';

/**
 * Field names (case-insensitive) that must never be persisted in plaintext,
 * per spec section 16.
 */
const SENSITIVE_BODY_FIELDS = new Set([
  'password',
  'confirmpassword',
  'confirm_password',
  'refreshtoken',
  'refresh_token',
  'otp',
  'sessioncookie',
  'session_cookie',
  'apisecret',
  'api_secret',
  'secret',
  'token',
]);

const SENSITIVE_HEADERS = new Set([
  'x-stqa-key',
  'authorization',
  'cookie',
  'set-cookie',
]);

/**
 * Deep-clones a JSON-like body, replacing sensitive field values with a
 * redaction marker. Non-object bodies are returned unmodified.
 */
export function redactBody(body: unknown): unknown {
  if (body === null || typeof body !== 'object') return body;
  if (Array.isArray(body)) return body.map(redactBody);

  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (SENSITIVE_BODY_FIELDS.has(key.toLowerCase())) {
      out[key] = REDACTED;
    } else if (value && typeof value === 'object') {
      out[key] = redactBody(value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

/**
 * Redacts sensitive header values before persisting request/response headers.
 */
export function redactHeaders(
  headers: Record<string, string | string[] | undefined>,
): Record<string, string | string[] | undefined> {
  const out: Record<string, string | string[] | undefined> = {};
  for (const [key, value] of Object.entries(headers)) {
    out[key] = SENSITIVE_HEADERS.has(key.toLowerCase()) ? REDACTED : value;
  }
  return out;
}

/**
 * Truncates a JSON body (as a string) to `maxBytes`, returning both the
 * possibly-truncated string and whether truncation occurred.
 */
export function truncateForLog(
  value: unknown,
  maxBytes: number,
): { text: string | null; truncated: boolean } {
  if (value === undefined || value === null) return { text: null, truncated: false };
  let text: string;
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value);
  } catch {
    return { text: '[unserializable body]', truncated: true };
  }
  const buf = Buffer.from(text, 'utf8');
  if (buf.length <= maxBytes) return { text, truncated: false };
  return { text: buf.subarray(0, maxBytes).toString('utf8'), truncated: true };
}
