/**
 * Pure media-library helpers (pagination window, lightbox cycling, byte
 * formatting) — shared by the media grid UI. No React/`@/` imports so it runs
 * under dep-free `node --test`.
 */

/** Human-readable byte size: "512 B", "3.4 KB", "12 MB". "" for bad input. */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return "";
  if (n < 1024) return `${Math.round(n)} B`;
  const kb = n / 1024;
  if (kb < 1024) return `${trim1(kb)} KB`;
  return `${trim1(kb / 1024)} MB`;
}
/** One decimal under 10, whole number above ("3.4", "42"). */
const trim1 = (v: number) => String(v < 10 ? Math.round(v * 10) / 10 : Math.round(v));

/** Wrap-around index step (lightbox prev/next). -1 when the list is empty. */
export function cycleIndex(i: number, delta: -1 | 1, length: number): number {
  if (length <= 0) return -1;
  return (i + delta + length) % length;
}

/**
 * Clamp a 0-based page into range and compute the 1-based item window.
 * total=0 → { page:0, pageCount:1, from:0, to:0 } (renders "0 of 0" states).
 */
export function pageWindow(
  page: number,
  pageSize: number,
  total: number,
): { page: number; pageCount: number; from: number; to: number } {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const p = Math.min(Math.max(0, page), pageCount - 1);
  return {
    page: p,
    pageCount,
    from: total === 0 ? 0 : p * pageSize + 1,
    to: Math.min(total, (p + 1) * pageSize),
  };
}
