/**
 * The first AI tool: create/update a component (Milestone 2, epic B2).
 *
 * The AI assistant authors a custom UI component by emitting the artifact
 * `{ name, tree, script, css }` (see GOAL.md M2 / the `component` table, A1).
 * This module owns the two PURE, offline-testable concerns of that tool:
 *
 *  1. `CREATE_COMPONENT_TOOL` — the OpenAI-style function/tool schema we hand to
 *     the model call (`Ai.chat({ tools })`) so the model knows how to call it.
 *  2. `validateComponentArtifact` — the security/correctness gate. The model's
 *     output is UNTRUSTED structure: we re-validate the `tree` shape (via the
 *     same pure `planTree` the renderer uses — if it can't be planned it can't
 *     render). We do NOT class-check `className`: the page renderer compiles the
 *     page's actual Tailwind at request time (tw-compile.ts), so ANY valid
 *     Tailwind class ships real CSS. A bad artifact is rejected with messages the
 *     route feeds back to the model, never written to D1.
 *
 * The actual D1 write lives in `db/component-store.ts` (needs the binding); the
 * agentic call loop lives in the route. Both are build-verified only (the live
 * model call can't run offline — see HITL). This module is PURE (no React/D1/CF
 * imports) so it's unit-tested with the project's dep-free `node --test`.
 *
 * NOTE ON `script`: it is AI-authored TRUSTED client JS (the GOAL security
 * boundary is "never interpolate END-USER data into script", not "never run
 * AI script") — so we do NOT try to parse/sandbox it here. We only bound its
 * size to avoid a runaway artifact. The browser executes it, never the server.
 */

// Relative (not @/) imports so this stays node-testable like its pure peers
// (the dep-free `node --test` convention can't resolve the @/ alias; see CAVEATS).
import { planTree, type TreeNode } from "../render/tree.ts";
import { parseHtml } from "../render/parse-html.ts";
import { SLOT_RE } from "../render/plan-tree.ts";
import { normalizeTags } from "../components/tags.ts";
import { lintComponentHtml, lintSlotsDeclared } from "./lint-component-html.ts";

// A jsonld component renders no HTML, so its `tree` is the empty tree parseHtml("")
// produces — reused rather than hand-building a literal that could drift from the shape.
const EMPTY_TREE: TreeNode = parseHtml("");

/** The two component kinds (seo-robots JSON-LD track). "html" (default) renders
 *  the artifact as visible markup; "jsonld" treats it as a JSON template emitted
 *  as an application/ld+json script (no visible HTML). */
export type ComponentKind = "html" | "jsonld";

/** The validated, ready-to-persist component artifact. */
export interface ComponentArtifactInput {
  name: string;
  tree: TreeNode;
  script: string;
  css: string;
  // Component kind (JSON-LD track). Absent → undefined (an update leaves the
  // stored kind untouched; a create defaults to "html" in the store). For a
  // "jsonld" component `tree` is the empty tree — the raw JSON template lives in
  // `jsonTemplate` because it isn't HTML markup.
  kind?: ComponentKind;
  // For a jsonld component: the raw JSON-LD TEMPLATE string (a schema.org object
  // with `{{prop}}` slots) that goes verbatim into the `html`/`draft_html` column.
  // Undefined for an html component (its markup lives in `tree`).
  jsonTemplate?: string;
  // JSON string `{ propName: { type, default } }`. The `default` doubles as the
  // PLACEHOLDER value the standalone preview binds into the `{{prop}}` slots, so
  // a component renders with realistic sample data outside any page. Omitted/""
  // for a fully static component with no slots.
  propsSchema?: string;
  // Operator/kit labels (component-kits). Normalized array; omitted leaves any
  // existing tags untouched on update. Drives the page-builder rail's by-tag view.
  tags?: string[];
  // Human display label shown in the UI (the `name` can't hold spaces). Omitted
  // leaves an existing label untouched; "" clears it (UI falls back to `name`).
  label?: string;
}

// A display label is free-form but bounded so a confused model can't store a blob.
const MAX_LABEL_LEN = 100;

// Bound the script so a confused model can't emit a multi-MB blob into D1.
const MAX_SCRIPT_BYTES = 64 * 1024;
// A component name the page block tree references — keep it a safe identifier.
const NAME_RE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/**
 * The tool schema handed to the model. OpenAI/Workers-AI function-calling shape.
 * `tree` is described as a JSON element tree; the model returns it as a string
 * (most open models emit JSON-as-string in tool args) OR a nested object — the
 * validator accepts both (see `coerceTree`).
 */
export const CREATE_COMPONENT_TOOL = {
  type: "function" as const,
  function: {
    name: "create_component",
    description:
      "Create or update a reusable UI component for this site. Author it as a " +
      "Handlebars-style HTML string, plus an optional client-side 'script' the " +
      "browser runs and 'css' utility classes. Style with standard Tailwind " +
      "utilities (normal scales supported); for truly one-off values use an " +
      "inline `style` attribute.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description:
            "PascalCase component name the page references, e.g. 'PricingCard'. " +
            "Re-using an existing name updates that component.",
        },
        kind: {
          type: "string",
          enum: ["html", "jsonld"],
          description:
            "Component kind. Omit or 'html' for a normal visible UI component. " +
            "'jsonld' makes an INVISIBLE structured-data component: `html` then holds " +
            "a JSON-LD template (a schema.org object with `{{slot}}`s and a @context + " +
            "@type) rendered as an application/ld+json script — used for SEO rich " +
            "results on pages (Product, Article, FAQPage, BreadcrumbList, etc.). " +
            "Wrap string slots in quotes (\"name\": \"{{title}}\"); leave numeric/array " +
            "slots unquoted (\"count\": {{n}}). script/css are ignored for jsonld.",
        },
        html: {
          type: "string",
          description:
            "For an html component: the markup as a Handlebars-style HTML string, e.g. " +
            '`<div class="p-4"><h2>{{t title}}</h2><p>{{body}}</p></div>`. Use ' +
            "`{{prop}}` for a plain value and `{{t prop}}` for a translatable " +
            "value; declare every slot in propsSchema. Use `class` with allowed " +
            "Tailwind utilities. Reference another component by its PascalCase " +
            "tag, e.g. `<AuthorCard name=\"{{author}}\"></AuthorCard>`. " +
            'For a jsonld component this is the JSON-LD TEMPLATE instead, e.g. ' +
            '`{"@context":"https://schema.org","@type":"Product","name":"{{title}}"}`.',
        },
        script: {
          type: "string",
          description:
            "Optional client-side JavaScript run in the browser. Empty for a " +
            "static component. Never embed end-user data here.",
        },
        css: {
          type: "string",
          description:
            "Optional space-separated extra utility classes applied to the root.",
        },
        propsSchema: {
          type: "object",
          description:
            "Declares every {{slot}} the tree references, as " +
            "{ propName: { type, default } }. ALWAYS include this whenever the " +
            "tree has any {{slots}}: `default` is REQUIRED PLACEHOLDER data — a " +
            "realistic sample value (e.g. a real-sounding title, paragraph, price, " +
            "or image URL) so the component renders meaningfully on its own in the " +
            "preview. type is one of string|richtext|number|boolean|select|image|icon. Use " +
            "`richtext` for any prose/long-text/multi-line slot (body copy, " +
            "descriptions, paragraphs) so the editor gives it a textarea; reserve " +
            "`string` for short single-line labels (titles, button text, hrefs); use " +
            "`icon` for an editable icon name referenced by an `{{icon prop}}` slot " +
            "(call search_icons for valid names). Omit " +
            "only for a fully static component with no slots.",
        },
        tags: {
          type: "array",
          items: { type: "string" },
          description:
            "Optional short operator labels for grouping this component (e.g. " +
            "['BasicRestaurant', 'Hero']). Used to build/export UI kits and the " +
            "page-builder's by-tag view. Omit to leave existing tags unchanged.",
        },
        label: {
          type: "string",
          description:
            "Optional human display label shown in the UI, e.g. 'Hero — Emozione'. " +
            "Can contain spaces (the `name` cannot). Omit to leave an existing label " +
            "unchanged; pass '' to clear it (the UI then shows the name).",
        },
      },
      required: ["name", "html"],
    },
  },
};

/**
 * Validate a raw tool-call argument object into a persistable artifact, or
 * return the list of problems (which the route relays back to the model so it
 * can retry). PURE — never throws, never writes.
 */
export function validateComponentArtifact(
  args: unknown,
): { ok: true; artifact: ComponentArtifactInput } | { ok: false; errors: string[] } {
  const errors: string[] = [];

  if (typeof args !== "object" || args === null) {
    return { ok: false, errors: ["tool arguments must be a JSON object"] };
  }
  const a = args as Record<string, unknown>;

  // ── name ──
  const name = typeof a.name === "string" ? a.name.trim() : "";
  if (!NAME_RE.test(name)) {
    errors.push(
      "name must match /^[A-Za-z][A-Za-z0-9_-]{0,63}$/ (a PascalCase-ish identifier)",
    );
  }

  // ── kind ── (JSON-LD track). Absent → undefined (update leaves stored kind
  // alone; create defaults to "html"). A jsonld component's `html` field is a
  // JSON TEMPLATE, not markup — it takes a wholly different validation path.
  const rawKind = a.kind;
  if (rawKind !== undefined && rawKind !== "html" && rawKind !== "jsonld") {
    return {
      ok: false,
      errors: [`kind must be "html" or "jsonld" (got ${JSON.stringify(rawKind)})`],
    };
  }
  const kind = rawKind as ComponentKind | undefined;

  if (kind === "jsonld") {
    return validateJsonLdArtifact(name, a, errors);
  }

  // ── html ── (Handlebars-HTML string → element tree via the renderer's parser)
  const html = typeof a.html === "string" ? a.html : "";
  let tree: TreeNode | undefined;
  if (html.trim() === "") {
    // The model sometimes fires update_component with empty html in the SAME batch
    // as get_component — before the real artifact comes back. update REPLACES, so
    // empty html would wipe the component. Name the cause + the fix (per the AI
    // error philosophy) so it self-corrects instead of retrying blind.
    errors.push(
      "html is empty — update_component REPLACES the whole component, so empty " +
        "html would erase it. Call get_component(name) FIRST, wait for its result, " +
        "then re-pass the COMPLETE html (the existing markup plus your edit).",
    );
  } else {
    tree = parseHtml(html);
    // Reuse the renderer's own walker: if it can't be planned, it can't render.
    try {
      planTree(tree);
    } catch (err) {
      errors.push(`html is not renderable: ${(err as Error).message}`);
    }
    // No className allowlist: the page renderer compiles the page's actual
    // Tailwind classes at request time (see tw-compile.ts), so ANY valid
    // Tailwind class — variants (hover:, md:), arbitrary values (h-[37px]) —
    // ships real CSS. Nothing to reject here.
    //
    // STRICT lint on the raw string: parseHtml is lenient (auto-closes, drops
    // stray closers), so an unbalanced/misnested artifact would otherwise be
    // silently "repaired" into a wrong-but-valid tree. The slot↔schema check
    // runs below, once propsSchema is coerced.
    errors.push(...lintComponentHtml(html));
  }

  // ── script ── (optional, bounded)
  const script = typeof a.script === "string" ? a.script : "";
  if (byteLength(script) > MAX_SCRIPT_BYTES) {
    errors.push(`script exceeds ${MAX_SCRIPT_BYTES} bytes`);
  }

  // ── css ── (optional extra root classes; any valid Tailwind class is fine,
  // the renderer compiles them at request time — see html note above).
  const css = typeof a.css === "string" ? a.css.trim() : "";

  // ── propsSchema ── (optional; object or JSON string of one). Stored verbatim
  // as a JSON string; `{prop:{type,default}}` whose `default`s are the preview
  // placeholders. Reject only if present-but-not-an-object so a typo surfaces;
  // an empty `{}` is valid but stored as nothing (no point).
  const propsSchema = coercePropsSchema(a.propsSchema);
  if (propsSchema === "invalid") {
    errors.push("propsSchema must be an object { propName: { type, default } } (or a JSON string of one)");
  } else if (propsSchema && html.trim() !== "") {
    // Slot↔schema cross-check, only when THIS call supplies a schema (an update
    // that omits propsSchema keeps the stored one, which we can't see here — the
    // pure validator has no DB access).
    errors.push(...lintSlotsDeclared(html, propsSchema));
  }

  // ── tags ── (optional; array of short labels). Absent → undefined (update
  // leaves existing tags alone); present-but-not-array → ignored as []. normalizeTags
  // drops junk/over-long/dupes, so an untrusted list is safe.
  const tags = a.tags === undefined ? undefined : normalizeTags(a.tags);

  // ── label ── (optional free-form display string). Absent → undefined (leave
  // existing); "" → cleared. Trimmed + length-bounded. Non-string ignored.
  const label =
    a.label === undefined ? undefined : typeof a.label === "string" ? a.label.trim().slice(0, MAX_LABEL_LEN) : undefined;

  if (errors.length > 0) return { ok: false, errors };
  const schemaStr = typeof propsSchema === "string" && propsSchema !== "invalid" ? propsSchema : undefined;
  return {
    ok: true,
    artifact: {
      name,
      tree: tree as TreeNode,
      script,
      css,
      // Explicit html kind only when the caller passed one — an omitted kind stays
      // undefined so an update to an existing component leaves its stored kind alone.
      ...(kind ? { kind } : {}),
      ...(schemaStr ? { propsSchema: schemaStr } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(label !== undefined ? { label } : {}),
    },
  };
}

/**
 * Validate a `kind:"jsonld"` artifact. A jsonld component's `html` field is a
 * JSON-LD TEMPLATE (a schema.org object with `{{prop}}` slots), NOT markup — so
 * we do NOT parse it as HTML or lint the tree. Instead we require it to parse as a
 * JSON OBJECT once slots are stripped (a template like `"n": {{count}}` isn't valid
 * JSON on its own, so we blank the slots first), and to carry `@context` + `@type`.
 * Self-correcting errors name the exact problem + the fix (per the AI error philosophy).
 * The raw template goes to `jsonTemplate` (stored verbatim in the `html` column);
 * `tree` is the empty tree so the html render path never touches it.
 */
function validateJsonLdArtifact(
  name: string,
  a: Record<string, unknown>,
  errors: string[],
): { ok: true; artifact: ComponentArtifactInput } | { ok: false; errors: string[] } {
  const template = typeof a.html === "string" ? a.html : "";
  if (template.trim() === "") {
    errors.push(
      "html is empty — a jsonld component's html is its JSON-LD TEMPLATE (a " +
        "schema.org object). update_component REPLACES it, so empty html would " +
        "erase it. Re-pass the COMPLETE JSON-LD template.",
    );
  } else {
    // Replace every {{slot}} with `0` so the bare template parses regardless of
    // whether the slot sits inside quotes (`"name":"{{t}}"` → `"name":"0"`) or is
    // an unquoted value (`"count":{{n}}` → `"count":0`) — we validate the SHAPE,
    // not a bound value. `0` is a legal JSON token in both positions.
    const probe = template.replace(SLOT_RE, "0");
    let parsed: unknown;
    try {
      parsed = JSON.parse(probe);
    } catch (err) {
      errors.push(
        `jsonld template is not valid JSON: ${(err as Error).message}. It must be a ` +
          `JSON object; use {{slot}} where a value should be interpolated (wrap string ` +
          `slots in quotes: "name": "{{title}}"; leave numeric/array slots unquoted: "count": {{n}}).`,
      );
    }
    if (parsed !== undefined) {
      if (parsed == null || typeof parsed !== "object" || Array.isArray(parsed)) {
        errors.push("jsonld template must be a JSON OBJECT (the schema.org node), not an array or scalar");
      } else {
        const obj = parsed as Record<string, unknown>;
        if (!("@context" in obj)) {
          errors.push('jsonld template is missing "@context" (e.g. "https://schema.org")');
        }
        if (!("@type" in obj)) {
          errors.push('jsonld template is missing "@type" (e.g. "Product", "Article", "BreadcrumbList")');
        }
      }
    }
  }

  // script/css are irrelevant to a jsonld component (it emits no HTML/JS) — ignore
  // any that come in. propsSchema/tags/label carry over exactly like the html path.
  const propsSchema = coercePropsSchema(a.propsSchema);
  if (propsSchema === "invalid") {
    errors.push("propsSchema must be an object { propName: { type, default } } (or a JSON string of one)");
  }
  const tags = a.tags === undefined ? undefined : normalizeTags(a.tags);
  const label =
    a.label === undefined ? undefined : typeof a.label === "string" ? a.label.trim().slice(0, MAX_LABEL_LEN) : undefined;

  if (errors.length > 0) return { ok: false, errors };
  const schemaStr = typeof propsSchema === "string" && propsSchema !== "invalid" ? propsSchema : undefined;
  return {
    ok: true,
    artifact: {
      name,
      tree: EMPTY_TREE,
      script: "",
      css: "",
      kind: "jsonld",
      jsonTemplate: template,
      ...(schemaStr ? { propsSchema: schemaStr } : {}),
      ...(tags !== undefined ? { tags } : {}),
      ...(label !== undefined ? { label } : {}),
    },
  };
}

/**
 * Normalize a propsSchema value into a canonical JSON string. Returns `undefined`
 * when absent or empty (valid, nothing to store), the literal `"invalid"` when
 * present but not an object (a typo to surface), else the JSON string.
 */
function coercePropsSchema(raw: unknown): string | undefined {
  if (raw == null) return undefined;
  let obj: unknown = raw;
  if (typeof raw === "string") {
    if (raw.trim() === "") return undefined;
    try {
      obj = JSON.parse(raw);
    } catch {
      return "invalid";
    }
  }
  if (obj == null || typeof obj !== "object" || Array.isArray(obj)) return "invalid";
  if (Object.keys(obj as Record<string, unknown>).length === 0) return undefined;
  return JSON.stringify(obj);
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
