/**
 * Base64 encode/decode a UTF-8 string for carrying multi-line / non-ASCII values
 * in an HTTP header (btoa/atob are latin1-only, so we UTF-8-transcode first).
 *
 * Used to ship a jsonld component's raw JSON-LD template out-of-band on the
 * components GET (the portable bundle's `tree` is a parseHtml-mangled version).
 * PURE — only Web platform globals (btoa/atob/TextEncoder), runs in Worker + node.
 */

export function encodeBase64Utf8(s: string): string {
  return btoa(String.fromCharCode(...new TextEncoder().encode(s)));
}

export function decodeBase64Utf8(b64: string | null | undefined): string {
  if (!b64) return "";
  try {
    return new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));
  } catch {
    return "";
  }
}
