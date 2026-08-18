/**
 * Pure per-alias edits on a curated catalog (add / update / remove / reorder),
 * used by the MCP `ai_models_*` tools. The UI edits the whole catalog client-side
 * and PUTs it back; an MCP caller instead names one alias, so these helpers
 * express that as a whole-catalog transform that the same normalize + persist
 * path (`normalizeCuratedPurposes` → `setCuratedPurposes`) then stores.
 *
 * Pure and dependency-free (no `@/`, no drizzle) — node `--test` loadable.
 */
import {
  aliasKeyFromLabel,
  type AiPurpose,
  type CuratedModel,
  type CuratedPurposes,
} from "./curated.ts";

const ALIAS_KEY_RE = /^[a-z0-9-]{1,40}$/;

export type EditResult =
  | { ok: true; purposes: CuratedPurposes; entry: CuratedModel }
  | { ok: false; error: string; message: string };

function clone(purposes: CuratedPurposes): CuratedPurposes {
  const out = {} as CuratedPurposes;
  for (const p of Object.keys(purposes) as AiPurpose[]) {
    out[p] = { models: purposes[p].models.map((m) => ({ ...m })) };
  }
  return out;
}

function parseMargin(raw: unknown, fallback: number): number | "invalid" {
  if (raw === undefined || raw === null) return fallback;
  const n = typeof raw === "string" ? Number(raw) : raw;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : "invalid";
}

/** Clamp a requested 0-based position into a list of `length` (append when absent). */
function resolvePosition(raw: unknown, length: number): number {
  if (typeof raw !== "number" || !Number.isInteger(raw)) return length;
  return Math.max(0, Math.min(length, raw));
}

/**
 * Add an alias to a purpose. `key` is optional — derived from `label` (deduped)
 * when omitted; an explicit key must match `[a-z0-9-]{1,40}` and be unused in
 * that purpose. `position` (0-based) inserts; position 0 makes it the default.
 */
export function addCuratedModel(
  purposes: CuratedPurposes,
  purpose: AiPurpose,
  input: { label?: unknown; model?: unknown; key?: unknown; marginPct?: unknown; position?: unknown },
): EditResult {
  const model = typeof input.model === "string" ? input.model.trim() : "";
  if (!model) {
    return { ok: false, error: "modelRequired", message: "`model` (an OpenRouter model id like `openai/gpt-4o-mini`) is required." };
  }
  const next = clone(purposes);
  const list = next[purpose].models;
  const taken = list.map((m) => m.key);

  const label = typeof input.label === "string" && input.label.trim() ? input.label.trim() : model.split("/").pop() || model;
  let key: string;
  if (input.key !== undefined && input.key !== null && input.key !== "") {
    key = String(input.key).trim().toLowerCase();
    if (!ALIAS_KEY_RE.test(key)) {
      return { ok: false, error: "keyInvalid", message: "`key` must match [a-z0-9-]{1,40}." };
    }
    if (taken.includes(key)) {
      return { ok: false, error: "keyTaken", message: `Alias key "${key}" already exists in ${purpose}; keys are unique per purpose.` };
    }
  } else {
    key = aliasKeyFromLabel(label, taken);
  }
  const marginPct = parseMargin(input.marginPct, 30);
  if (marginPct === "invalid") {
    return { ok: false, error: "marginInvalid", message: "`marginPct` must be a number ≥ 0." };
  }
  const entry: CuratedModel = { key, label, model, marginPct };
  list.splice(resolvePosition(input.position, list.length), 0, entry);
  return { ok: true, purposes: next, entry };
}

/**
 * Update an existing alias (by immutable `key`): label, model id, margin, and/or
 * position within its purpose. Fields left undefined are unchanged.
 */
export function updateCuratedModel(
  purposes: CuratedPurposes,
  purpose: AiPurpose,
  key: string,
  patch: { label?: unknown; model?: unknown; marginPct?: unknown; position?: unknown },
): EditResult {
  const next = clone(purposes);
  const list = next[purpose].models;
  const idx = list.findIndex((m) => m.key === key);
  if (idx < 0) {
    return { ok: false, error: "notFound", message: `No alias "${key}" in ${purpose}. Keys: ${list.map((m) => m.key).join(", ") || "(none)"}.` };
  }
  const entry = { ...list[idx] };
  if (patch.model !== undefined) {
    const model = typeof patch.model === "string" ? patch.model.trim() : "";
    if (!model) return { ok: false, error: "modelRequired", message: "`model` cannot be blank." };
    entry.model = model;
  }
  if (patch.label !== undefined) {
    const label = typeof patch.label === "string" ? patch.label.trim() : "";
    if (!label) return { ok: false, error: "labelRequired", message: "`label` cannot be blank." };
    entry.label = label;
  }
  const marginPct = parseMargin(patch.marginPct, entry.marginPct);
  if (marginPct === "invalid") {
    return { ok: false, error: "marginInvalid", message: "`marginPct` must be a number ≥ 0." };
  }
  entry.marginPct = marginPct;

  list.splice(idx, 1);
  const pos = patch.position === undefined ? Math.min(idx, list.length) : resolvePosition(patch.position, list.length);
  list.splice(pos, 0, entry);
  return { ok: true, purposes: next, entry };
}

/** Remove an alias by key. Removing the last alias of a purpose is allowed but flagged. */
export function removeCuratedModel(
  purposes: CuratedPurposes,
  purpose: AiPurpose,
  key: string,
): EditResult {
  const next = clone(purposes);
  const list = next[purpose].models;
  const idx = list.findIndex((m) => m.key === key);
  if (idx < 0) {
    return { ok: false, error: "notFound", message: `No alias "${key}" in ${purpose}. Keys: ${list.map((m) => m.key).join(", ") || "(none)"}.` };
  }
  const [entry] = list.splice(idx, 1);
  return { ok: true, purposes: next, entry };
}
