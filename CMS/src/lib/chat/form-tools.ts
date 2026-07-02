/**
 * external-data-sources — Form slice (d): AI tools for the built-in Form block.
 *
 *   - create_form → insert a built-in `Form` block into a Section column with
 *                   its submission TARGET (api saved request OR opted-in
 *                   collection) + optional authored messages/redirect.
 *   - bind_form   → (re)configure an EXISTING Form block's target/messages
 *                   (PATCH semantics), or clear the target entirely.
 *
 * Mirrors `binding-tools.ts`: the PURE concerns (tool schemas + arg shaping +
 * the formTarget merge) live HERE so they run under the dep-free `node --test`
 * (relative `.ts` imports, no `@/`). The CF-coupled work — resolve the source/
 * request or collection, enforce the collection's `publicSubmissions` opt-in,
 * mutate the page draft via the page-blocks helpers — is wired in
 * `tool-dispatch.ts`.
 *
 * There is NO field→placeholder map argument BY DESIGN: the shipped submit
 * pipeline matches form field NAMES to the saved request's `{placeholder}`
 * names (api kind) or the collection's declared field names (collection kind)
 * — see `submit-core.ts`. The tools therefore RETURN the expected field names
 * so the assistant can author child components whose `<input name=…>` line up.
 */
import type { FormTarget } from "../render/plan-types.ts";

/** Result of validating a tool's args: a clean payload, or an error message. */
type ArgResult<T> = { ok: true; value: T } | { ok: false; error: string };

function asRecord(args: unknown): Record<string, unknown> | null {
  return typeof args === "object" && args !== null && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : null;
}

/** A non-empty trimmed string at `key`, or undefined. */
function str(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Redirect must be a safe same-site path: starts "/", not "//" (open redirect). */
function shapeRedirect(rec: Record<string, unknown>): ArgResult<string | undefined> {
  const redirect = str(rec, "redirect");
  if (redirect === undefined) return { ok: true, value: undefined };
  if (!redirect.startsWith("/") || redirect.startsWith("//")) {
    return {
      ok: false,
      error: `redirect must be a same-site path starting with "/" (got "${redirect}") — external URLs are not allowed`,
    };
  }
  return { ok: true, value: redirect };
}

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

const TARGET_FIELDS_DOC =
  "The form's TARGET is source-agnostic: pass `source`+`request` (an external " +
  "API saved request — the visitor's field values fill the request's " +
  "{placeholder} tokens server-side; the secret never reaches the browser) OR " +
  "`collection` (visitor submissions land as DRAFT items in a collection that " +
  "has publicSubmissions enabled) — never both. Field mapping is BY NAME: each " +
  "<input name=…> inside the form must match a request {placeholder} name / a " +
  "declared collection field name; the tool result lists the expected names.";

export const CREATE_FORM_TOOL = {
  type: "function" as const,
  function: {
    name: "create_form",
    description:
      "Insert a built-in Form block into a page Section. A Form renders as a real " +
      "<form>: place ANY component with <input name=…> fields and a " +
      'type="submit" button inside it (native form semantics — no JS wiring) and ' +
      "visitor submissions post to the CMS's submit endpoint. " +
      TARGET_FIELDS_DOC +
      " Identify the page by id and the Section by its block id (get_page shows " +
      "the tree). PREFER passing `child` (the name of an EXISTING component with " +
      "the form's inputs) so one call yields a complete submittable form — the " +
      "result's `fields` array names the inputs the child must render. Without " +
      "`child` the form is created empty and you must place the component " +
      "afterwards (update_page_blocks re-passing the ENTIRE tree). " +
      "Optional: authored success/error messages (shown inline) and a same-site " +
      "redirect path after a no-JS submit.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", description: "The page id." },
        section: { type: "string", description: "The id of the Section block to insert the Form into." },
        source: { type: "string", description: "api target: the data source id or name (list_data_sources)." },
        request: { type: "string", description: "api target: the saved request id or name on that source (typically POST/PUT/DELETE)." },
        collection: { type: "string", description: "collection target: the content_<slug> table name (must have publicSubmissions enabled)." },
        child: { type: "string", description: "The name of an EXISTING component to place inside the form (create_component it first). Its <input name=…> fields should match the target's field names and it needs a type=\"submit\" button." },
        successMessage: { type: "string", description: "Inline success message (fetch mode). Omit for the default." },
        errorMessage: { type: "string", description: "Inline error message (fetch mode). Omit for the default." },
        redirect: { type: "string", description: 'Same-site path to redirect to after a no-JS submit, e.g. "/thanks".' },
      },
      required: ["page", "section"],
    },
  },
} as const;

export const BIND_FORM_TOOL = {
  type: "function" as const,
  function: {
    name: "bind_form",
    description:
      "Reconfigure an EXISTING Form block on a page: switch or set its submission " +
      "target, or update its authored messages/redirect. " +
      TARGET_FIELDS_DOC +
      " PATCH semantics: pass only what you want to change (e.g. just " +
      "successMessage). Pass `clear: true` to remove the target entirely (the " +
      "form renders as a plain container). Identify the page by id and the Form " +
      "by its block id (get_page shows it; component is 'Form').",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", description: "The page id." },
        block: { type: "string", description: "The id of the Form block." },
        source: { type: "string", description: "api target: the data source id or name (switches the form to an api target)." },
        request: { type: "string", description: "api target: the saved request id or name (required with `source`)." },
        collection: { type: "string", description: "collection target: the content_<slug> table name (switches the form to a collection target)." },
        successMessage: { type: "string", description: "Inline success message (fetch mode)." },
        errorMessage: { type: "string", description: "Inline error message (fetch mode)." },
        redirect: { type: "string", description: "Same-site path to redirect to after a no-JS submit." },
        clear: { type: "boolean", description: "true = remove the form's target (and authored messages) entirely." },
      },
      required: ["page", "block"],
    },
  },
} as const;

// ── Pure arg validation/coercion (no store, no CF — node-testable) ────────────

export interface CreateFormArgs {
  page: string;
  section: string;
  /** api target: the data source id or name (resolved in the dispatch handler). */
  source?: string;
  /** api target: the saved request id or name. */
  request?: string;
  /** collection target: the content_<slug> table name. */
  collection?: string;
  /** Optional: an EXISTING component to place inside the form (validated in the dispatch handler). */
  child?: string;
  successMessage?: string;
  errorMessage?: string;
  redirect?: string;
}

export function validateCreateForm(args: unknown): ArgResult<CreateFormArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with page, section and a target (source+request or collection)" };
  const page = str(rec, "page");
  if (!page) return { ok: false, error: "page (id) is required" };
  const section = str(rec, "section");
  if (!section) return { ok: false, error: "section (block id) is required" };

  const collection = str(rec, "collection");
  const source = str(rec, "source");
  if (collection && source) {
    return { ok: false, error: "pass either `collection` (collection target) or `source`+`request` (API target), not both" };
  }
  if (!collection && !source) {
    return { ok: false, error: "the form needs a target: pass `source`+`request` (API saved request) or `collection` (opted-in collection)" };
  }
  let request: string | undefined;
  if (source) {
    request = str(rec, "request");
    if (!request) {
      return { ok: false, error: "request (the saved request id or name) is required for an API target — list_data_sources shows them" };
    }
  }
  const redirect = shapeRedirect(rec);
  if (!redirect.ok) return redirect;

  return {
    ok: true,
    value: {
      page,
      section,
      ...(source ? { source, request } : { collection }),
      child: str(rec, "child"),
      successMessage: str(rec, "successMessage"),
      errorMessage: str(rec, "errorMessage"),
      redirect: redirect.value,
    },
  };
}

export interface BindFormArgs {
  page: string;
  block: string;
  /** When true, remove the block's formTarget entirely. */
  clear: boolean;
  source?: string;
  request?: string;
  collection?: string;
  successMessage?: string;
  errorMessage?: string;
  redirect?: string;
}

export function validateBindForm(args: unknown): ArgResult<BindFormArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with page and block" };
  const page = str(rec, "page");
  if (!page) return { ok: false, error: "page (id) is required" };
  const block = str(rec, "block");
  if (!block) return { ok: false, error: "block (id) is required" };

  if (rec.clear === true) return { ok: true, value: { page, block, clear: true } };

  const collection = str(rec, "collection");
  const source = str(rec, "source");
  if (collection && source) {
    return { ok: false, error: "pass either `collection` (collection target) or `source`+`request` (API target), not both" };
  }
  let request: string | undefined;
  if (source) {
    request = str(rec, "request");
    if (!request) {
      return { ok: false, error: "request (the saved request id or name) is required with `source` — list_data_sources shows them" };
    }
  }
  const redirect = shapeRedirect(rec);
  if (!redirect.ok) return redirect;

  const out: BindFormArgs = { page, block, clear: false };
  if (source) {
    out.source = source;
    out.request = request;
  }
  if (collection) out.collection = collection;
  const successMessage = str(rec, "successMessage");
  if (successMessage) out.successMessage = successMessage;
  const errorMessage = str(rec, "errorMessage");
  if (errorMessage) out.errorMessage = errorMessage;
  if (redirect.value) out.redirect = redirect.value;

  if (!out.source && !out.collection && !out.successMessage && !out.errorMessage && !out.redirect) {
    return {
      ok: false,
      error:
        "nothing to change — pass a target (`source`+`request` or `collection`), a message " +
        "(successMessage/errorMessage), a `redirect`, or `clear: true`",
    };
  }
  return { ok: true, value: out };
}

// ── Pure formTarget merge (bind_form's PATCH semantics) ──────────────────────

/**
 * Merge a bind_form patch onto the block's existing formTarget. The RESOLVED
 * target ids come from the dispatch handler (source/request refs → row ids;
 * collection existence + publicSubmissions already enforced there). Switching
 * kinds drops the other kind's fields; messages/redirect always survive unless
 * explicitly patched.
 */
export function mergeFormTarget(
  prev: FormTarget | undefined,
  patch: {
    api?: { sourceId: string; requestId: string };
    collection?: string;
    successMessage?: string;
    errorMessage?: string;
    redirect?: string;
  },
): FormTarget {
  const out: FormTarget = { ...(prev ?? {}) };
  if (patch.api) {
    out.kind = "api";
    out.sourceId = patch.api.sourceId;
    out.requestId = patch.api.requestId;
    delete out.collection;
  } else if (patch.collection) {
    out.kind = "collection";
    out.collection = patch.collection;
    delete out.sourceId;
    delete out.requestId;
  }
  if (patch.successMessage !== undefined) out.successMessage = patch.successMessage;
  if (patch.errorMessage !== undefined) out.errorMessage = patch.errorMessage;
  if (patch.redirect !== undefined) out.redirect = patch.redirect;
  return out;
}
