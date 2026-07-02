/**
 * Form-block submit endpoint — the PURE core (external-data-sources Form
 * slice (a)). Everything the public `/api/forms/submit` route decides that
 * doesn't need I/O lives here, dep-free, so it runs under `node --test`:
 *
 *  - field collection from the posted entries (form-data or JSON), with the
 *    TRUST-BOUNDARY caps (field count / value length) and the hidden identity
 *    fields (`__bb_page` / `__bb_block`) split out,
 *  - finding the targeted Form block inside the published page's block tree,
 *  - filling an api saved request's `{placeholder}` params from the fields,
 *  - building the collection-item body (declared schema fields ONLY, status
 *    FORCED to "draft" — visitor submissions are never auto-published),
 *  - the per-IP rate decision and the dual-mode (JSON vs redirect) detection.
 *
 * The route owns the effects: D1 reads, the central fetch engine call, the
 * item insert, and the attempt recording.
 */
import { FORM_COMPONENT, type Block, type FormTarget } from "../render/plan-types.ts";
import { FORM_PAGE_FIELD, FORM_BLOCK_FIELD } from "../render/plan-form.ts";

// ── Trust-boundary caps ──────────────────────────────────────────────────────
/** Reject request bodies larger than this before parsing (Content-Length). */
export const MAX_FORM_BODY_BYTES = 64 * 1024;
/** Max distinct fields a submission may carry. */
export const MAX_FORM_FIELDS = 100;
/** Max length of one field value (characters). */
export const MAX_FIELD_VALUE_LEN = 8_192;

// ── Rate limit (per client IP, sliding window) ───────────────────────────────
// ponytail: per-IP fixed budget; per-form budgets only if a real site needs them.
export const FORM_RATE_MAX = 20;
export const FORM_RATE_WINDOW_MS = 10 * 60 * 1000;

/** Locked once `timestamps` holds FORM_RATE_MAX entries inside the window. */
export function decideFormRate(
  timestamps: number[],
  now: number = Date.now(),
): { locked: boolean } {
  const inWindow = timestamps.filter((t) => t > now - FORM_RATE_WINDOW_MS);
  return { locked: inWindow.length >= FORM_RATE_MAX };
}

// ── Submission parsing ───────────────────────────────────────────────────────

export type ParsedSubmission =
  | {
      ok: true;
      pageId: string;
      blockId: string;
      /** Visitor fields (identity fields stripped; string values only). */
      fields: Record<string, string>;
    }
  | { ok: false; status: number; error: string };

/**
 * Collect the submission from posted entries (FormData entries or JSON object
 * entries). Non-string values (file uploads) are SKIPPED — v1 forms are
 * text-only. Enforces the field caps and requires both identity fields.
 */
export function collectSubmission(
  entries: Iterable<[string, unknown]>,
): ParsedSubmission {
  const fields: Record<string, string> = {};
  let pageId = "";
  let blockId = "";
  let count = 0;
  for (const [name, raw] of entries) {
    const value =
      typeof raw === "string"
        ? raw
        : typeof raw === "number" || typeof raw === "boolean"
          ? String(raw)
          : null;
    if (value === null) continue; // files / objects: not supported in v1
    if (value.length > MAX_FIELD_VALUE_LEN) {
      return { ok: false, status: 413, error: `field "${name}" is too long` };
    }
    if (name === FORM_PAGE_FIELD) {
      pageId = value;
      continue;
    }
    if (name === FORM_BLOCK_FIELD) {
      blockId = value;
      continue;
    }
    count += 1;
    if (count > MAX_FORM_FIELDS) {
      return { ok: false, status: 413, error: "too many fields" };
    }
    fields[name] = value;
  }
  if (!pageId || !blockId) {
    return { ok: false, status: 400, error: "missing form identity" };
  }
  return { ok: true, pageId, blockId, fields };
}

// ── Target resolution ────────────────────────────────────────────────────────

/**
 * Find the Form block with `blockId` anywhere in the published page's block
 * tree. Only a block whose component IS the Form built-in counts — a visitor
 * naming some other block's id gets nothing.
 */
export function findFormBlock(blocks: Block[], blockId: string): Block | null {
  for (const b of blocks) {
    if (b.id === blockId) return b.component === FORM_COMPONENT ? b : null;
    if (b.children) {
      const hit = findFormBlock(b.children, blockId);
      if (hit) return hit;
    }
  }
  return null;
}

// ── api target: placeholder params ──────────────────────────────────────────

/**
 * Fill a saved request's declared `{placeholder}` names from the submitted
 * fields (exact name match). Every placeholder must be supplied — a partial
 * fill would fire the request with literal `{tokens}` left in. Extra fields
 * are ignored (only declared placeholders are read). Encoding happens in the
 * central fetch engine (URL-encode / JSON-escape) — values pass through raw.
 */
export function apiParamsFromFields(
  placeholderNames: string[],
  fields: Record<string, string>,
): { ok: true; params: Record<string, string> } | { ok: false; error: string } {
  const params: Record<string, string> = {};
  const missing: string[] = [];
  for (const name of placeholderNames) {
    if (Object.prototype.hasOwnProperty.call(fields, name)) params[name] = fields[name];
    else missing.push(name);
  }
  if (missing.length > 0) {
    return { ok: false, error: `missing required field(s): ${missing.join(", ")}` };
  }
  return { ok: true, params };
}

// ── collection target: item body ─────────────────────────────────────────────

/**
 * Build the collection-item body from the submitted fields: ONLY the
 * collection's declared field names are kept (unknown fields dropped — the
 * schema is the allowlist; a visitor can never set `slug`, `status`, or any
 * system column), and `status` is FORCED to "draft" so submissions always
 * await operator review. Field-type validation/coercion happens downstream in
 * the existing `buildInsert` trust boundary.
 */
export function collectionBodyFromFields(
  fields: Record<string, string>,
  declaredFieldNames: string[],
): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const name of declaredFieldNames) {
    if (Object.prototype.hasOwnProperty.call(fields, name)) body[name] = fields[name];
  }
  body.status = "draft";
  return body;
}

// ── Dual submit mode ─────────────────────────────────────────────────────────

/** Fetch mode (progressive enhancement) announces itself via the Accept header. */
export function wantsJson(acceptHeader: string | null): boolean {
  return (acceptHeader ?? "").toLowerCase().includes("application/json");
}

/**
 * Where a NATIVE (no-JS) submit redirects afterwards. An authored
 * `target.redirect` wins when it is a safe same-site path ("/…", not "//…");
 * else back to the submitting page (Referer); else "/". The outcome rides in a
 * `bb_form` query param (`ok` / `error`) for styling/SSR to pick up later.
 */
export function formRedirectUrl(
  target: FormTarget | undefined,
  referer: string | null,
  ok: boolean,
): string {
  const authored = target?.redirect ?? "";
  const base =
    authored.startsWith("/") && !authored.startsWith("//")
      ? authored
      : referer && /^https?:\/\//i.test(referer)
        ? referer
        : "/";
  const sep = base.includes("?") ? "&" : "?";
  return `${base}${sep}bb_form=${ok ? "ok" : "error"}`;
}
