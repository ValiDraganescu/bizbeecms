/**
 * Pure helpers for the "key=value per line" query textarea in the
 * Data Sources UI. Extracted from data-sources-manager.tsx for node tests.
 */

/** key=value lines → query object (first "=" splits; value may contain "="). */
export function parseQueryLines(text: string): Record<string, string> {
  const query: Record<string, string> = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    const idx = line.indexOf("=");
    if (idx === -1) query[line] = "";
    else query[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return query;
}

/** query object → key=value lines (inverse of parseQueryLines for clean input). */
export function serializeQuery(query: Record<string, string>): string {
  return Object.entries(query)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}
