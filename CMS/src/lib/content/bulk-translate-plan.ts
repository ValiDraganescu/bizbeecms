/**
 * bulk-translate-missing — the PURE call planner (no UI, no I/O, no model).
 *
 * "Translate missing" (item form, collection sweep, page builder) fills every
 * ABSENT locale slot of translatable values in one user action. One
 * `POST /api/translate` call is a `fields` map × a `toLocales` array — EVERY
 * field in the call is translated into EVERY listed locale — so fields whose
 * missing-locale sets differ must go in SEPARATE calls or existing translations
 * would be re-produced (and the existing text must never be overwritten). This
 * module turns "what's missing" into the minimal ordered list of calls:
 *
 *   1. group entries by identical target-locale SET (common case — a locale was
 *      just added to the site — collapses to ONE call for the whole item);
 *   2. chunk a group across multiple calls when its source payload threatens
 *      the model's output-token budget (see CALL_BUDGET_UNITS);
 *   3. skip + report entries the route would reject anyway (empty source,
 *      source over the per-field byte cap).
 *
 * The core (`planTranslateCalls`) is schema-agnostic — it only sees
 * `{name, sourceText, targetLocales}` entries — so the collection-item adapter
 * here and the page-builder adapter (meta + block props, T3) share it.
 * Everything is PURE and dep-free so it runs under `node --test`.
 */
import { isTranslatableField, type CollectionField } from "./collection-schema.ts";
import { isLocaleObject, type ContentLocales } from "../render/localize.ts";
import { MAX_FIELD_TEXT_BYTES } from "../chat/translate-request.ts";

/** One translatable value with source text and the locales it's missing. */
export interface PlanEntry {
  /** Field name / prop path — becomes the key in a call's `fields` map. */
  name: string;
  /** Default-locale text to translate FROM. */
  sourceText: string;
  /** The locales this entry is missing (never includes the default locale). */
  targetLocales: string[];
}

/** One `/api/translate` request body core: fields map × target locales. */
export interface TranslateCall {
  fields: Record<string, string>;
  toLocales: string[];
}

export type SkipReason = "empty-source" | "oversized-source";

export interface SkippedEntry {
  name: string;
  reason: SkipReason;
}

export interface TranslatePlan {
  /** Ordered calls to execute sequentially (group order = first appearance). */
  calls: TranslateCall[];
  /** Entries that can't be translated at all (reported, never silently lost). */
  skipped: SkippedEntry[];
}

/**
 * Per-call source budget, in "units" of source-byte × target-locale.
 *
 * The output side is the binding constraint: the route generates with the
 * default output cap of 8000 tokens (DEFAULT_MAX_TOKENS in `lib/ports/ai.ts` —
 * mirrored here because that module imports the CF runtime and this one must
 * stay node-testable). A truncated reply loses the END of the JSON, i.e. whole
 * fields silently — so we must stay comfortably under the cap.
 *
 * Estimate: the model must emit roughly the source text once per target locale
 * (`Σ srcBytes × targetCount` bytes), inflated ~1.5× for language expansion +
 * JSON key/quote overhead, at a conservative ~3 bytes per token for non-English
 * UTF-8 text. Solving `units × 1.5 / 3 ≤ 8000` gives 16 000 units per call.
 *
 * Chunking is greedy in entry order and NEVER splits a single entry (a field is
 * atomic); a lone entry may therefore exceed the budget — it's still ≤ the
 * 16KB/field route cap, and one field × its locales is the smallest possible
 * call anyway.
 */
export const CALL_BUDGET_UNITS = 16_000;

/**
 * Turn missing-slot entries into the ordered call plan. Entries with an empty
 * target set are ignored (nothing missing — not an error); empty/oversized
 * sources are reported in `skipped`. PURE, input never mutated.
 */
export function planTranslateCalls(entries: PlanEntry[]): TranslatePlan {
  const skipped: SkippedEntry[] = [];
  /** key = sorted target-locale set; value keeps first-seen locale order. */
  const groups = new Map<
    string,
    { toLocales: string[]; members: { name: string; sourceText: string; cost: number }[] }
  >();

  for (const entry of entries) {
    if (entry.targetLocales.length === 0) continue;
    if (entry.sourceText.trim() === "") {
      skipped.push({ name: entry.name, reason: "empty-source" });
      continue;
    }
    const bytes = byteLength(entry.sourceText);
    if (bytes > MAX_FIELD_TEXT_BYTES) {
      skipped.push({ name: entry.name, reason: "oversized-source" });
      continue;
    }
    const key = [...entry.targetLocales].sort().join("|");
    let group = groups.get(key);
    if (!group) {
      group = { toLocales: [...entry.targetLocales], members: [] };
      groups.set(key, group);
    }
    group.members.push({
      name: entry.name,
      sourceText: entry.sourceText,
      cost: bytes * entry.targetLocales.length,
    });
  }

  const calls: TranslateCall[] = [];
  for (const group of groups.values()) {
    let fields: Record<string, string> = {};
    let used = 0;
    let count = 0;
    for (const member of group.members) {
      if (count > 0 && used + member.cost > CALL_BUDGET_UNITS) {
        calls.push({ fields, toLocales: [...group.toLocales] });
        fields = {};
        used = 0;
        count = 0;
      }
      fields[member.name] = member.sourceText;
      used += member.cost;
      count += 1;
    }
    if (count > 0) calls.push({ fields, toLocales: [...group.toLocales] });
  }

  return { calls, skipped };
}

/**
 * Classify ONE localized value (the read-seam shape: locale object, bare string
 * = default-only, or anything else = not text) into its default-locale source
 * text + the non-default locales missing a non-blank translation.
 *
 * "Missing" requires a source to translate FROM: a value with blank/absent
 * default-locale text reports NO missing locales (AC8 — nothing to translate
 * from; an unused optional field is not "missing translations"). A present but
 * blank target slot counts as missing — blank is not a translation.
 *
 * Schema-agnostic on purpose: the page-builder adapter (T3) feeds prop values
 * straight through this. PURE.
 */
export function missingLocaleSlots(
  value: unknown,
  locales: ContentLocales,
): { sourceText: string; missing: string[] } {
  const targets = locales.locales.filter((code) => code !== locales.default);
  if (targets.length === 0) return { sourceText: "", missing: [] };

  if (typeof value === "string") {
    // Bare string = default-locale-only → every other locale is missing.
    return {
      sourceText: value,
      missing: value.trim() === "" ? [] : targets,
    };
  }

  if (isLocaleObject(value)) {
    const map = value as Record<string, unknown>;
    const def = map[locales.default];
    const sourceText = typeof def === "string" ? def : "";
    if (sourceText.trim() === "") return { sourceText, missing: [] };
    const missing = targets.filter((code) => {
      const slot = map[code];
      return typeof slot !== "string" || slot.trim() === "";
    });
    return { sourceText, missing };
  }

  return { sourceText: "", missing: [] };
}

/**
 * Collection adapter: derive plan entries from a parsed item row (the
 * `parseLocalizedRow` output shape) + its schema fields + the site locales.
 * Only opt-in translatable fields are considered; fields with nothing missing
 * produce no entry (→ an already-complete item plans ZERO calls, and a
 * single-locale site always plans zero calls). PURE.
 */
export function collectionItemPlanEntries(
  values: Record<string, unknown>,
  fields: CollectionField[],
  locales: ContentLocales,
): PlanEntry[] {
  const entries: PlanEntry[] = [];
  for (const field of fields) {
    if (!isTranslatableField(field)) continue;
    const { sourceText, missing } = missingLocaleSlots(values[field.name], locales);
    if (missing.length === 0) continue;
    entries.push({ name: field.name, sourceText, targetLocales: missing });
  }
  return entries;
}

/**
 * Filter an `/api/translate` response (`{field: {locale: text}}`) down to
 * EXACTLY the field × locale slots `call` requested, dropping blank strings.
 * The model may return extra fields/locales (including the source-locale seed
 * `parseTranslateResponse` adds) — extras must NEVER be applied, or a bulk run
 * could overwrite existing translations it was told to leave alone. PURE.
 */
export function pickRequestedSlots(
  translations: Record<string, Record<string, unknown>> | null | undefined,
  call: TranslateCall,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  if (translations === null || typeof translations !== "object") return out;
  for (const name of Object.keys(call.fields)) {
    const map = translations[name];
    if (map === null || typeof map !== "object") continue;
    for (const locale of call.toLocales) {
      const text = map[locale];
      if (typeof text === "string" && text.trim() !== "") {
        (out[name] ??= {})[locale] = text;
      }
    }
  }
  return out;
}

/**
 * One-shot retry plan for a call whose response left slots unfilled: requested
 * slots minus slots returned non-blank, re-planned through the core (so a retry
 * with divergent per-field missing sets re-groups/re-chunks correctly). A fully
 * answered call yields zero calls. `skipped` is always empty in practice — the
 * sources already passed the original plan's gates. PURE.
 */
export function retryPlan(
  call: TranslateCall,
  translations: Record<string, Record<string, unknown>> | null | undefined,
): TranslatePlan {
  const got = pickRequestedSlots(translations, call);
  const entries: PlanEntry[] = [];
  for (const [name, sourceText] of Object.entries(call.fields)) {
    const missing = call.toLocales.filter((locale) => got[name]?.[locale] === undefined);
    if (missing.length > 0) entries.push({ name, sourceText, targetLocales: missing });
  }
  return planTranslateCalls(entries);
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
