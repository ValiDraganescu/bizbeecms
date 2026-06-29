/**
 * content-collections — Phase 2, Slice D: AI assistant component↔collection
 * BINDING tools (STRUCTURED only). The operator authors bindings in the page
 * builder (Slice C); these three tools let the assistant author the SAME bindings
 * on a page's draft block tree — NO forked data path, NO raw SQL to the model:
 *
 *   - bind_component → set a block's single-item binding (collection + first-match
 *                      query + field→prop map) under the "item" key (Slice A/C).
 *   - create_list    → insert a built-in `List` block into a Section column, with a
 *                      query + template component + row-field→template-prop map.
 *   - bind_list      → (re)configure an existing `List` block's query/template/map.
 *
 * Mirrors `collection-tools.ts`: the PURE concerns (tool schemas + arg shaping +
 * reject-the-obviously-malformed) live HERE so they're unit-tested with the
 * project's dep-free `node --test` (no `@/` alias resolves there, hence the `.ts`
 * relative imports). The CF-coupled work — load the page blocks, load the registry
 * + the target/template component's propsSchema, run `validateBinding`/
 * `validateListBinding`, mutate the tree via the Slice-C page-blocks helpers,
 * persist via `setPageBlocks` — is wired in `tool-dispatch.ts`.
 *
 * Validation philosophy: same as Slice 6 — these coercers pull the model's loose
 * args into the exact SHAPE the page-blocks helpers + validators expect, and
 * reject the malformed up front. The registry/propsSchema validation (unknown
 * collection/field/prop) is done by the SHARED `validateBinding`/
 * `validateListBinding` in the dispatch handler, not re-implemented here.
 */
import { FILTER_OPS } from "../content/query-compiler.ts";
import { normalizeLabelExpr } from "../render/tree.ts";

// ── Shared arg-shaping (mirrors collection-tools.validateQuery's filter/sort) ──

/** Result of validating a tool's args: a clean payload, or an error message. */
export type ArgResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** A filter clause as the renderer/query-compiler want it (op stays loose). */
export interface FilterClause {
  field: string;
  op: string;
  value?: unknown;
}
/** A sort clause. */
export interface SortClause {
  field: string;
  dir?: "asc" | "desc";
}

const FILTER_OP_SET = new Set<string>(FILTER_OPS);

function asRecord(args: unknown): Record<string, unknown> | null {
  return typeof args === "object" && args !== null ? (args as Record<string, unknown>) : null;
}

/** A non-empty trimmed string at `key`, or undefined. */
function str(rec: Record<string, unknown>, key: string): string | undefined {
  const v = rec[key];
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? undefined : t;
}

/** Shape `rec.filter|filters` into FilterClause[] (rejecting bad op/field), or an error. */
function shapeFilters(rec: Record<string, unknown>): ArgResult<FilterClause[]> {
  const raw = rec.filter ?? rec.filters;
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "filter must be an array" };
  const out: FilterClause[] = [];
  for (let i = 0; i < raw.length; i++) {
    const f = asRecord(raw[i]);
    if (!f) return { ok: false, error: `filter ${i} must be an object` };
    const field = str(f, "field");
    const op = str(f, "op");
    if (!field) return { ok: false, error: `filter ${i} is missing a field` };
    if (!op || !FILTER_OP_SET.has(op)) {
      return { ok: false, error: `filter on "${field}" has an invalid op (use ${FILTER_OPS.join(", ")})` };
    }
    out.push({ field, op, value: f.value });
  }
  return { ok: true, value: out };
}

/** Shape `rec.sort` into SortClause[], or an error. */
function shapeSort(rec: Record<string, unknown>): ArgResult<SortClause[]> {
  const raw = rec.sort;
  if (raw === undefined) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "sort must be an array" };
  const out: SortClause[] = [];
  for (let i = 0; i < raw.length; i++) {
    const s = asRecord(raw[i]);
    if (!s) return { ok: false, error: `sort ${i} must be an object` };
    const field = str(s, "field");
    if (!field) return { ok: false, error: `sort ${i} is missing a field` };
    const dir = str(s, "dir");
    out.push({ field, dir: dir === "desc" ? "desc" : dir === "asc" ? "asc" : undefined });
  }
  return { ok: true, value: out };
}

/** Shape `rec.map` into `{ propName → fieldName }` (both non-empty strings). */
function shapeMap(rec: Record<string, unknown>): ArgResult<Record<string, string>> {
  const raw = asRecord(rec.map);
  if (!raw) return { ok: false, error: "map must be an object of propName → fieldName" };
  const out: Record<string, string> = {};
  for (const [prop, field] of Object.entries(raw)) {
    if (typeof field !== "string" || field.trim() === "") {
      return { ok: false, error: `map entry "${prop}" must point at a non-empty field name` };
    }
    out[prop] = field.trim();
  }
  if (Object.keys(out).length === 0) return { ok: false, error: "map must name at least one prop → field" };
  return { ok: true, value: out };
}

function shapeLimit(rec: Record<string, unknown>): number | undefined {
  if (typeof rec.limit === "number" && Number.isFinite(rec.limit)) return rec.limit;
  if (typeof rec.limit === "string" && rec.limit.trim() !== "" && Number.isFinite(Number(rec.limit))) {
    return Number(rec.limit);
  }
  return undefined;
}

// ── Reusable JSON-schema fragments for the function descriptions ──────────────

const FILTER_SCHEMA = {
  type: "array",
  description: "Filter clauses (ANDed) to pick the matching row(s).",
  items: {
    type: "object",
    properties: {
      field: { type: "string", description: "A field (or system column) on the collection." },
      op: { type: "string", enum: [...FILTER_OPS] },
      value: { description: "The comparison value (array for `in`; omit for is_null/not_null)." },
    },
    required: ["field", "op"],
  },
} as const;

const SORT_SCHEMA = {
  type: "array",
  description: "Sort clauses (the first match wins for single-item binding).",
  items: {
    type: "object",
    properties: {
      field: { type: "string" },
      dir: { type: "string", enum: ["asc", "desc"] },
    },
    required: ["field"],
  },
} as const;

const MAP_SCHEMA = {
  type: "object",
  description:
    "Maps each TARGET component prop name to the collection field whose value " +
    "fills it: { propName: fieldName }. Only props DECLARED on the component and " +
    "fields that EXIST on the collection are accepted.",
} as const;

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

export const BIND_COMPONENT_TOOL = {
  type: "function" as const,
  function: {
    name: "bind_component",
    description:
      "Bind ONE block on a page to a SINGLE collection item: the block's props are " +
      "filled live from the FIRST item matching a structured query. Use this to make " +
      "a component show real collection data (e.g. a Hero showing the featured post). " +
      "Identify the page by its id (list_pages/get_page) and the block by its id " +
      "(get_page shows the block tree). The collection is its content_<slug> table " +
      "name (query_collection / list a collection to find it). Pass `map` as " +
      "{ propName: fieldName }. To REMOVE a binding, omit `collection` (or pass an " +
      "empty map) — the block reverts to its static props.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", description: "The page id." },
        block: { type: "string", description: "The id of the block to bind." },
        collection: { type: "string", description: "The collection's content_<slug> table name. Omit to clear the binding." },
        filter: FILTER_SCHEMA,
        sort: SORT_SCHEMA,
        map: MAP_SCHEMA,
      },
      required: ["page", "block"],
    },
  },
} as const;

export const CREATE_LIST_TOOL = {
  type: "function" as const,
  function: {
    name: "create_list",
    description:
      "Insert a built-in List block into a page Section that repeats a TEMPLATE " +
      "component once per matching collection item (e.g. a card per blog post). " +
      "Identify the page by id and the Section by its block id (get_page shows the " +
      "tree; create the Section first if there is none). `collection` is the " +
      "content_<slug> table name, `template` is an existing component name, and `map` " +
      "is { templatePropName: fieldName } binding each row's fields into the template. " +
      "Optional filter/sort/limit shape which rows appear.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", description: "The page id." },
        section: { type: "string", description: "The id of the Section block to insert the List into." },
        collection: { type: "string", description: "The collection's content_<slug> table name." },
        template: { type: "string", description: "The component name to stamp per row." },
        filter: FILTER_SCHEMA,
        sort: SORT_SCHEMA,
        limit: { type: "number", description: "Max rows to render." },
        map: MAP_SCHEMA,
      },
      required: ["page", "section", "collection", "template", "map"],
    },
  },
} as const;

export const BIND_LIST_TOOL = {
  type: "function" as const,
  function: {
    name: "bind_list",
    description:
      "Reconfigure an EXISTING List block on a page: its collection query, its per-row " +
      "template component, the row-field → template-prop map, AND its presentation. A " +
      "List can present as a flat list (default) OR as a COMBOBOX/SELECT dropdown — the " +
      "combobox/select control on a page IS a List block with `presentation:\"combobox\"`, " +
      "NOT a separate component. To change anything about a select/combobox (how the " +
      "chosen item's chip reads, single vs multiple, min/max, search, placeholder), call " +
      "THIS tool with the combobox fields below — do NOT update_component the item " +
      "component for that. Identify the page by id and the List by its block id (get_page " +
      "shows it; component is 'List'). PATCH semantics: pass only what you want to change.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", description: "The page id." },
        block: { type: "string", description: "The id of the List block." },
        collection: { type: "string", description: "The collection's content_<slug> table name." },
        template: { type: "string", description: "The component name to stamp per row (replaces the current template)." },
        filter: FILTER_SCHEMA,
        sort: SORT_SCHEMA,
        limit: { type: "number", description: "Max rows to render." },
        map: MAP_SCHEMA,
        presentation: {
          type: "string",
          enum: ["list", "combobox"],
          description: "How rows are shown: 'list' (flat) or 'combobox' (a selectable dropdown). The fields below apply only to 'combobox'.",
        },
        select: {
          type: "string",
          enum: ["single", "multiple"],
          description: "combobox: pick one ('single') or many ('multiple', default).",
        },
        min: { type: "number", description: "combobox: minimum selectable items (default 0)." },
        max: { type: "number", description: "combobox: maximum selectable items (0 = unlimited)." },
        searchable: { type: "boolean", description: "combobox: show the in-panel search box (default true)." },
        valueField: { type: "string", description: "combobox: collection field identifying each option (default the row id)." },
        labelField: { type: "string", description: "combobox: collection field shown as each selected item's chip in the trigger." },
        labelExpr: {
          type: "string",
          description:
            "combobox: a template for the selected-item chip text — use ${field} for row values, " +
            'e.g. "${name} · ${rating} ★". Plain text, NO surrounding backticks (they are stripped). ' +
            "Overrides labelField. THIS is the 'selection expression'.",
        },
        name: { type: "string", description: "combobox: the form field name the selection writes to (default 'selection')." },
        placeholder: { type: "string", description: "combobox: trigger text when nothing is selected." },
        searchPlaceholder: { type: "string", description: "combobox: search box placeholder." },
      },
      required: ["page", "block"],
    },
  },
} as const;

// ── Pure arg validation/coercion (no store, no CF — node-testable) ────────────

/**
 * bind_component: { page, block, collection?, filter?, sort?, map? }.
 * Omitting `collection` (or passing an empty map) means "clear the binding"
 * (`clear: true`); otherwise a full single-item binding payload.
 */
export interface BindComponentArgs {
  page: string;
  block: string;
  /** When true, remove the block's "item" binding (revert to static props). */
  clear: boolean;
  collection?: string;
  filter?: FilterClause[];
  sort?: SortClause[];
  map?: Record<string, string>;
}

export function validateBindComponent(args: unknown): ArgResult<BindComponentArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with page and block" };
  const page = str(rec, "page");
  if (!page) return { ok: false, error: "page (id) is required" };
  const block = str(rec, "block");
  if (!block) return { ok: false, error: "block (id) is required" };

  const collection = str(rec, "collection");
  // No collection → clear the binding.
  if (!collection) return { ok: true, value: { page, block, clear: true } };

  const filters = shapeFilters(rec);
  if (!filters.ok) return filters;
  const sort = shapeSort(rec);
  if (!sort.ok) return sort;
  const map = shapeMap(rec);
  if (!map.ok) return map;

  return {
    ok: true,
    value: { page, block, clear: false, collection, filter: filters.value, sort: sort.value, map: map.value },
  };
}

/** create_list: { page, section, collection, template, filter?, sort?, limit?, map }. */
export interface CreateListArgs {
  page: string;
  section: string;
  collection: string;
  template: string;
  filter: FilterClause[];
  sort: SortClause[];
  limit?: number;
  map: Record<string, string>;
}

export function validateCreateList(args: unknown): ArgResult<CreateListArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with page, section, collection, template and map" };
  const page = str(rec, "page");
  if (!page) return { ok: false, error: "page (id) is required" };
  const section = str(rec, "section");
  if (!section) return { ok: false, error: "section (block id) is required" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  const template = str(rec, "template");
  if (!template) return { ok: false, error: "template (component name) is required" };

  const filters = shapeFilters(rec);
  if (!filters.ok) return filters;
  const sort = shapeSort(rec);
  if (!sort.ok) return sort;
  const map = shapeMap(rec);
  if (!map.ok) return map;

  return {
    ok: true,
    value: { page, section, collection, template, filter: filters.value, sort: sort.value, limit: shapeLimit(rec), map: map.value },
  };
}

/**
 * bind_list: { page, block, collection?, template?, filter?, sort?, limit?, map? }.
 * Every config field is optional (PATCH-like) — pass only what to change.
 */
export interface BindListArgs {
  page: string;
  block: string;
  collection?: string;
  template?: string;
  filter?: FilterClause[];
  sort?: SortClause[];
  limit?: number;
  map?: Record<string, string>;
  // Presentation + combobox config (all optional, PATCH-like).
  presentation?: "list" | "combobox";
  select?: "single" | "multiple";
  min?: number;
  max?: number;
  searchable?: boolean;
  valueField?: string;
  labelField?: string;
  labelExpr?: string;
  name?: string;
  placeholder?: string;
  searchPlaceholder?: string;
}

export function validateBindList(args: unknown): ArgResult<BindListArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with page and block" };
  const page = str(rec, "page");
  if (!page) return { ok: false, error: "page (id) is required" };
  const block = str(rec, "block");
  if (!block) return { ok: false, error: "block (id) is required" };

  const out: BindListArgs = { page, block };
  const collection = str(rec, "collection");
  if (collection) out.collection = collection;
  const template = str(rec, "template");
  if (template) out.template = template;

  if (rec.filter !== undefined || rec.filters !== undefined) {
    const filters = shapeFilters(rec);
    if (!filters.ok) return filters;
    out.filter = filters.value;
  }
  if (rec.sort !== undefined) {
    const sort = shapeSort(rec);
    if (!sort.ok) return sort;
    out.sort = sort.value;
  }
  const limit = shapeLimit(rec);
  if (limit !== undefined) out.limit = limit;
  if (rec.map !== undefined) {
    const map = shapeMap(rec);
    if (!map.ok) return map;
    out.map = map.value;
  }

  // Presentation + combobox config (each independently optional).
  const presentation = str(rec, "presentation");
  if (presentation === "list" || presentation === "combobox") out.presentation = presentation;
  else if (presentation) return { ok: false, error: 'presentation must be "list" or "combobox"' };
  const select = str(rec, "select");
  if (select === "single" || select === "multiple") out.select = select;
  else if (select) return { ok: false, error: 'select must be "single" or "multiple"' };
  if (typeof rec.min === "number" && Number.isFinite(rec.min)) out.min = rec.min;
  if (typeof rec.max === "number" && Number.isFinite(rec.max)) out.max = rec.max;
  if (typeof rec.searchable === "boolean") out.searchable = rec.searchable;
  const valueField = str(rec, "valueField");
  if (valueField) out.valueField = valueField;
  const labelField = str(rec, "labelField");
  if (labelField) out.labelField = labelField;
  // Strip any backticks the model added — labelExpr is stored as a bare
  // template-literal body; the renderer wraps it. (See normalizeLabelExpr.)
  const labelExpr = normalizeLabelExpr(str(rec, "labelExpr"));
  if (labelExpr) out.labelExpr = labelExpr;
  const name = str(rec, "name");
  if (name) out.name = name;
  const placeholder = str(rec, "placeholder");
  if (placeholder) out.placeholder = placeholder;
  const searchPlaceholder = str(rec, "searchPlaceholder");
  if (searchPlaceholder) out.searchPlaceholder = searchPlaceholder;

  return { ok: true, value: out };
}
