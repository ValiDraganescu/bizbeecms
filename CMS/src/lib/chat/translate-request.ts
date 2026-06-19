/**
 * Programmatic AI-translate request shaping (Milestone 2, ai-assistant goal).
 *
 * The chat tool (`translate-tool.ts`) only fires when the LLM *decides* to call
 * it mid-conversation. This module backs a DIRECT, button-driven path
 * (`POST /api/translate`): the caller hands the SOURCE-locale text per field and
 * the AI fills the site's OTHER content locales. It reuses the exact same
 * downstream pieces — `validateTranslationInput` (shape gate) + `applyTranslation`
 * (D1 merge) — so there is ONE translation write path, not two.
 *
 * Everything here is PURE (no D1 / CF / model imports) so it's unit-tested with
 * the project's dep-free `node --test` (see CAVEATS). The route owns the model
 * call (via the `Ai` port) and the D1 write; this module shapes the request and
 * parses the model's reply into the locale maps `validateTranslationInput` wants.
 */
import {
  isValidLocaleCode,
  normalizeLocaleCode,
} from "../render/localize.ts";
import { SseDeltaParser } from "./sse.ts";
import type { LocaleStringMap, TranslateTargetKind } from "./translate-tool.ts";

/** The parsed direct-translate request body. */
export interface TranslateRequest {
  kind: TranslateTargetKind;
  /** Page slug (kind=page) or component name (kind=component). */
  target: string;
  /** Source locale of the supplied text (must be a valid content locale). */
  fromLocale: string;
  /**
   * Explicit target locales. Omit/empty → the route fills with the Site's
   * content locales minus `fromLocale`.
   */
  toLocales?: string[];
  /** field path → source-locale text to translate, e.g. `{ metaTitle: "Pricing" }`. */
  fields: Record<string, string>;
}

const MAX_FIELD_TEXT_BYTES = 16 * 1024;

/**
 * Validate the direct `/api/translate` body into a `TranslateRequest`, or return
 * the problems (route → 400). PURE — never throws. Note `fields` here are PLAIN
 * source strings (one locale), unlike the chat tool's already-localized maps.
 */
export function parseTranslateRequest(
  body: unknown,
): { ok: true; request: TranslateRequest } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  if (typeof body !== "object" || body === null) {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }
  const b = body as Record<string, unknown>;

  let kind: TranslateTargetKind | null = null;
  if (b.kind === "page" || b.kind === "component") kind = b.kind;
  else errors.push("kind must be 'page' or 'component'");

  const target = typeof b.target === "string" ? b.target.trim() : "";
  if (target === "") errors.push("target must be a non-empty page slug or component name");

  const fromLocale =
    typeof b.fromLocale === "string" ? normalizeLocaleCode(b.fromLocale) : "";
  if (!isValidLocaleCode(fromLocale)) errors.push("fromLocale must be a valid locale code");

  let toLocales: string[] | undefined;
  if (b.toLocales !== undefined) {
    if (!Array.isArray(b.toLocales)) {
      errors.push("toLocales must be an array of locale codes");
    } else {
      toLocales = [];
      for (const t of b.toLocales) {
        const code = typeof t === "string" ? normalizeLocaleCode(t) : "";
        if (!isValidLocaleCode(code)) {
          errors.push(`toLocales contains an invalid locale code: ${String(t)}`);
        } else if (!toLocales.includes(code)) {
          toLocales.push(code);
        }
      }
    }
  }

  const fields: Record<string, string> = {};
  const rawFields = b.fields;
  if (typeof rawFields !== "object" || rawFields === null || Array.isArray(rawFields)) {
    errors.push("fields must be a JSON object of fieldName → source text");
  } else {
    for (const [field, value] of Object.entries(rawFields as Record<string, unknown>)) {
      if (typeof value !== "string" || value.trim() === "") {
        errors.push(`fields["${field}"] must be a non-empty string`);
      } else if (byteLength(value) > MAX_FIELD_TEXT_BYTES) {
        errors.push(`fields["${field}"] exceeds ${MAX_FIELD_TEXT_BYTES} bytes`);
      } else {
        fields[field] = value;
      }
    }
    if (Object.keys(fields).length === 0 && errors.length === 0) {
      errors.push("fields must contain at least one field to translate");
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, request: { kind: kind!, target, fromLocale, toLocales, fields } };
}

/**
 * The locales to PRODUCE. Explicit `toLocales` win (minus the source); otherwise
 * the Site's content locales minus the source. Always normalized + deduped, and
 * the source is never in the result. PURE.
 */
export function resolveTargetLocales(
  fromLocale: string,
  toLocales: string[] | undefined,
  siteLocales: string[],
): string[] {
  const from = normalizeLocaleCode(fromLocale);
  const source =
    toLocales && toLocales.length > 0 ? toLocales : siteLocales;
  const out: string[] = [];
  for (const code of source) {
    const norm = normalizeLocaleCode(code);
    if (!isValidLocaleCode(norm) || norm === from || out.includes(norm)) continue;
    out.push(norm);
  }
  return out;
}

/**
 * Build the model messages that ask for a translation. We force a strict JSON
 * reply: `{ "<field>": { "<locale>": "<text>" } }` covering EVERY field × target
 * locale, so `parseTranslateResponse` can extract it deterministically. PURE.
 */
export function buildTranslateMessages(
  fromLocale: string,
  toLocales: string[],
  fields: Record<string, string>,
): { role: string; content: string }[] {
  const fieldList = Object.entries(fields)
    .map(([name, text]) => `  ${JSON.stringify(name)}: ${JSON.stringify(text)}`)
    .join("\n");

  const system =
    "You are a professional translator for a website CMS. Translate UI/content " +
    "text accurately and naturally, preserving meaning, tone, and any inline " +
    "placeholders/markup. Reply with ONLY a JSON object — no prose, no code " +
    "fences. The object maps each field name to an object of locale code → " +
    "translated string. Include every requested field and every requested " +
    "locale. Do not add or rename fields.";

  const user =
    `Source locale: ${fromLocale}\n` +
    `Translate into these locales: ${toLocales.join(", ")}\n` +
    `Fields (name: source text):\n${fieldList}\n\n` +
    `Return JSON of shape { "<field>": { "<locale>": "<translation>" } } ` +
    `with exactly these fields and locales.`;

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
}

/**
 * Drain a streaming `Ai.chat` SSE byte stream into the full assistant text.
 * Reuses the same `SseDeltaParser` the chat route streams through, so the
 * non-streaming path can't drift from the streaming one. Never throws on a
 * malformed chunk (the parser tolerates keep-alives / partial garbage).
 */
export async function collectStreamText(
  stream: ReadableStream<Uint8Array>,
): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  const parser = new SseDeltaParser();
  let text = "";
  const take = (events: ReturnType<SseDeltaParser["push"]>) => {
    for (const ev of events) if (ev.type === "delta") text += ev.text;
  };
  for (;;) {
    const { done, value } = await reader.read();
    if (value) take(parser.push(decoder.decode(value, { stream: true })));
    if (done) break;
  }
  take(parser.flush());
  return text;
}

/**
 * Parse the model's reply into per-field locale maps ready for
 * `validateTranslationInput`. We (1) pull the first JSON object out of the text
 * (tolerating stray prose / code fences a small model may add), (2) keep only the
 * requested fields × target locales with string values, and (3) seed each field
 * with the SOURCE text under `fromLocale` so the merged artifact keeps the
 * original too. Returns the maps + any fields/locales the model missed. PURE.
 */
export function parseTranslateResponse(
  text: string,
  fromLocale: string,
  toLocales: string[],
  sourceFields: Record<string, string>,
): {
  fields: Record<string, LocaleStringMap>;
  missing: string[];
} {
  const obj = extractFirstJsonObject(text);
  const from = normalizeLocaleCode(fromLocale);
  const fields: Record<string, LocaleStringMap> = {};
  const missing: string[] = [];

  for (const [field, sourceText] of Object.entries(sourceFields)) {
    // Always keep the source text under the source locale.
    const map: LocaleStringMap = { [from]: sourceText };
    const modelMap =
      obj && typeof obj[field] === "object" && obj[field] !== null
        ? (obj[field] as Record<string, unknown>)
        : null;
    for (const loc of toLocales) {
      const value = modelMap ? modelMap[loc] : undefined;
      if (typeof value === "string" && value.trim() !== "") {
        map[loc] = value;
      } else {
        missing.push(`${field}[${loc}]`);
      }
    }
    fields[field] = map;
  }

  return { fields, missing };
}

/**
 * Find and parse the first balanced top-level `{...}` JSON object in `text`,
 * ignoring braces inside strings. Tolerant of leading prose / ```json fences a
 * small model may wrap the answer in. Returns null if none parses.
 */
function extractFirstJsonObject(text: string): Record<string, unknown> | null {
  const start = text.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === "\\") escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) {
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
            ? (parsed as Record<string, unknown>)
            : null;
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
