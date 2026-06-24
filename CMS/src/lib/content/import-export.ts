/**
 * content-collections — Import/export (CSV/JSON), PURE (no I/O).
 *
 * Export = take rows (already fetched from the store) + the registry field list and
 * serialize to CSV or a JSON array. Import = parse a CSV/JSON text blob into plain
 * row objects shaped for `createItem` (the live store re-validates+coerces+fences
 * every value, so this module does NO trust work beyond shaping — it strips the
 * generated system columns that must NOT be re-imported verbatim).
 *
 * The exported column order is: slug, status, then the user fields (in registry
 * order). We DELIBERATELY drop id/archived_at/created_at/updated_at from the
 * round-trip — they're system-managed; a fresh import gets fresh ones. (slug +
 * status are operator-meaningful so we keep them; createItem accepts both.)
 */
import type { CollectionField } from "./collection-schema.ts";

/** Columns we emit/accept on import, besides the user fields. */
const KEPT_SYSTEM_COLUMNS = ["slug", "status"] as const;
/** System columns that are generated on import — never round-tripped. */
const DROPPED_ON_IMPORT = new Set(["id", "archived_at", "created_at", "updated_at"]);

function exportColumns(fields: CollectionField[]): string[] {
  return [...KEPT_SYSTEM_COLUMNS, ...fields.map((f) => f.name)];
}

/** Stringify ONE cell value for CSV/JSON-text export. */
function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v); // multiselect already TEXT, but be safe
  return String(v);
}

// ── CSV (RFC-4180-ish: comma sep, CRLF rows, quote when needed, "" escapes ") ──

function csvEscape(s: string): string {
  if (s === "") return "";
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Serialize rows → CSV text. PURE. */
export function rowsToCsv(rows: Record<string, unknown>[], fields: CollectionField[]): string {
  const cols = exportColumns(fields);
  const lines = [cols.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => csvEscape(cellToString(row[c]))).join(","));
  }
  return lines.join("\r\n");
}

/**
 * Parse CSV text → array of field arrays. PURE. Handles quoted fields, escaped
 * quotes (`""`), and embedded commas/newlines. Accepts LF or CRLF line endings.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let i = 0;
  const n = text.length;

  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };

  while (i < n) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ",") {
      pushField();
      i++;
      continue;
    }
    if (ch === "\r") {
      // swallow CR; the LF (or end) closes the row
      i++;
      if (text[i] === "\n") i++;
      pushRow();
      continue;
    }
    if (ch === "\n") {
      i++;
      pushRow();
      continue;
    }
    field += ch;
    i++;
  }
  // flush trailing field/row (unless the input ended exactly on a row break)
  if (field !== "" || row.length > 0) pushRow();
  return rows;
}

/** Strip system columns that must be regenerated on import. PURE. */
function stripDropped(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!DROPPED_ON_IMPORT.has(k)) out[k] = v;
  }
  return out;
}

export type ParseResult =
  | { ok: true; rows: Record<string, unknown>[] }
  | { ok: false; error: string };

/**
 * Parse an import payload (CSV or JSON text) → row objects ready for createItem.
 * PURE. Unknown columns are kept (createItem ignores non-field keys); generated
 * system columns are dropped. Empty cells become "" (createItem treats "" as
 * absent → column DEFAULT / null applies).
 */
export function parseImport(text: string, format: "csv" | "json"): ParseResult {
  if (format === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { ok: false, error: "invalid JSON" };
    }
    if (!Array.isArray(parsed)) return { ok: false, error: "JSON must be an array of objects" };
    const rows: Record<string, unknown>[] = [];
    for (const r of parsed) {
      if (!r || typeof r !== "object" || Array.isArray(r)) {
        return { ok: false, error: "each JSON element must be an object" };
      }
      rows.push(stripDropped(r as Record<string, unknown>));
    }
    return { ok: true, rows };
  }

  // CSV
  const table = parseCsv(text);
  if (table.length === 0) return { ok: true, rows: [] };
  const header = table[0];
  if (header.length === 0 || header.every((h) => h === "")) {
    return { ok: false, error: "CSV header row is empty" };
  }
  const rows: Record<string, unknown>[] = [];
  for (let r = 1; r < table.length; r++) {
    const cells = table[r];
    // skip a wholly-blank trailing line
    if (cells.length === 1 && cells[0] === "") continue;
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < header.length; c++) {
      const key = header[c];
      if (!key) continue;
      obj[key] = cells[c] ?? "";
    }
    rows.push(stripDropped(obj));
  }
  return { ok: true, rows };
}

/** Suggested download filename for an export. PURE. */
export function exportFilename(tableName: string, format: "csv" | "json"): string {
  return `${tableName}.${format}`;
}
