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
import type { ApiParamSpec } from "../data-sources/bind.ts";

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

/**
 * Shape `rec.search` (collection List free-text search) — a literal string, a
 * route-value ref (`{"query":"q"}`/`{"param":"x"}`), or undefined. No FTS/AND
 * semantics here; the query-compiler ORs it across the collection's text
 * fields (see query-compiler.ts `search`), unlike `filter` which ANDs.
 */
function shapeSearch(rec: Record<string, unknown>): ArgResult<unknown> {
  const raw = rec.search;
  if (raw === undefined) return { ok: true, value: undefined };
  if (typeof raw === "string") return { ok: true, value: raw };
  const obj = asRecord(raw);
  const hasRef = obj && (typeof obj.param === "string" || typeof obj.query === "string");
  if (!hasRef) {
    return { ok: false, error: 'search must be a string or { "param": "name" } / { "query": "name" }' };
  }
  return { ok: true, value: raw };
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

/**
 * Shape `rec.params` (api-source `{placeholder}` values) into an ApiParamSpec:
 * a literal (string/number/boolean → string) or `{ prop: "propName" }` read from
 * the block's props at render. external-data-sources Slice 6.
 */
function shapeApiParams(rec: Record<string, unknown>): ArgResult<ApiParamSpec | undefined> {
  const raw = rec.params;
  if (raw === undefined) return { ok: true, value: undefined };
  const obj = asRecord(raw);
  if (!obj) {
    return { ok: false, error: "params must be an object of placeholder → literal value or { prop: 'propName' }" };
  }
  const out: ApiParamSpec = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[k] = String(v);
    } else {
      const p = asRecord(v);
      const prop = p ? str(p, "prop") : undefined;
      if (!prop) {
        return { ok: false, error: `param "${k}" must be a literal (string) or { prop: "propName" }` };
      }
      out[k] = { prop };
    }
  }
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
      value: {
        description:
          "The comparison value (array for `in`; omit for is_null/not_null). " +
          "Dynamic pages: instead of a literal, pass { \"param\": \"city-slug\" } " +
          "(the page's wildcard route segment) or { \"query\": \"q\" } (a URL " +
          "query param) — absent per-request → clause dropped, never errors " +
          "(see get_data_sources_guide).",
      },
    },
    required: ["field", "op"],
  },
} as const;

const SEARCH_SCHEMA = {
  description:
    "Collection rows only: free-text search OR'd across the collection's " +
    "text-typed fields (case-insensitive contains). Use it, not `filter`, when " +
    "one needle should match ANY of several fields (filter clauses AND). A " +
    'literal string, or { "param": … } / { "query": … } route ref (absent → ' +
    "no search).",
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

// external-data-sources Slice 6: API-source binding fragments (shared by the
// three binding tools). An api bind names a data source + saved request instead
// of a collection; `map` values are then response DOT-PATHS, not field names.
const API_SOURCE_SCHEMA = {
  type: "string",
  description:
    "API-source binding: the external data source id or name (list_data_sources). " +
    "Pass EITHER `collection` (collection binding) OR `source`+`request` (API binding), never both.",
} as const;

const API_REQUEST_SCHEMA = {
  type: "string",
  description: "API-source binding: the saved request id or name on that source.",
} as const;

const API_PARAMS_SCHEMA = {
  type: "object",
  description:
    "API-source binding: values for the request's {placeholder} tokens — a literal " +
    "string, or { prop: 'propName' } to read one of the block's own props at render.",
} as const;

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

export const BIND_COMPONENT_TOOL = {
  type: "function" as const,
  function: {
    name: "bind_component",
    description:
      "Bind ONE block on a page to a SINGLE data item; its props fill live at " +
      "render. Collection kind: `collection` + `map` of { propName: fieldName } " +
      "(first match of filter/sort wins). API kind: `source` + `request` + `map` " +
      "of { propName: 'response.dot.path' } (+ `params` for {placeholder} tokens) " +
      "— test_data_source lists the mappable paths. Never both kinds; omit both " +
      "to REMOVE the binding. Page + block are ids (get_page shows the tree). Map " +
      "only props DECLARED on the component. Full playbook: get_data_sources_guide.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", description: "The page id." },
        block: { type: "string", description: "The id of the block to bind." },
        collection: { type: "string", description: "Collection binding: the content_<slug> table name. Omit (with no `source`) to clear the binding." },
        filter: FILTER_SCHEMA,
        sort: SORT_SCHEMA,
        source: API_SOURCE_SCHEMA,
        request: API_REQUEST_SCHEMA,
        params: API_PARAMS_SCHEMA,
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
      "Insert a built-in List block into a page Section: repeats a TEMPLATE " +
      "component once per data row (e.g. a card per blog post). Rows from a " +
      "COLLECTION (`collection` + optional filter/sort; `map` values are field " +
      "names) OR an API DATA SOURCE (`source` + `request`; `map` values are " +
      "response dot-paths from test_data_source; `itemsPath` digs to a nested " +
      "rows array; `params` fills {placeholder} tokens). `template` is an " +
      "existing component name; `map` = { templatePropName: fieldOrPath }. Page " +
      "+ Section are ids (get_page shows the tree; create the Section first if " +
      "none). Full playbook: get_data_sources_guide.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", description: "The page id." },
        section: { type: "string", description: "The id of the Section block to insert the List into." },
        collection: { type: "string", description: "Collection rows: the content_<slug> table name." },
        template: { type: "string", description: "The component name to stamp per row." },
        filter: FILTER_SCHEMA,
        search: SEARCH_SCHEMA,
        sort: SORT_SCHEMA,
        source: API_SOURCE_SCHEMA,
        request: API_REQUEST_SCHEMA,
        params: API_PARAMS_SCHEMA,
        itemsPath: { type: "string", description: "API rows: dot-path to the rows array when nested in the response." },
        limit: { type: "number", description: "Max rows to render." },
        map: MAP_SCHEMA,
      },
      required: ["page", "section", "template", "map"],
    },
  },
} as const;

export const BIND_LIST_TOOL = {
  type: "function" as const,
  function: {
    name: "bind_list",
    description:
      "Reconfigure an EXISTING List block — PATCH semantics, pass only what " +
      "changes: row source (`collection` query OR `source`+`request` API with a " +
      "dot-path map), per-row `template` component, the row → prop `map`, and " +
      "presentation/layout. A select/combobox on a page IS a List with " +
      "`presentation:\"combobox\"`, NOT a separate component — change anything " +
      "about it (chip text, single vs multiple, min/max, search, placeholder) via " +
      "THIS tool's combobox fields, never by update_component on the item " +
      "component. Page + block are ids (get_page shows it; component is 'List'). " +
      "Full playbook: get_data_sources_guide.",
    parameters: {
      type: "object",
      properties: {
        page: { type: "string", description: "The page id." },
        block: { type: "string", description: "The id of the List block." },
        collection: { type: "string", description: "Collection rows: the content_<slug> table name (switches the List to collection rows)." },
        template: { type: "string", description: "The component name to stamp per row (replaces the current template)." },
        filter: FILTER_SCHEMA,
        search: SEARCH_SCHEMA,
        sort: SORT_SCHEMA,
        source: API_SOURCE_SCHEMA,
        request: API_REQUEST_SCHEMA,
        params: API_PARAMS_SCHEMA,
        itemsPath: { type: "string", description: "API rows: dot-path to the rows array when nested in the response." },
        limit: { type: "number", description: "Max rows to render." },
        map: MAP_SCHEMA,
        presentation: {
          type: "string",
          enum: ["list", "combobox"],
          description: "How rows are shown: 'list' (flat) or 'combobox' (a selectable dropdown). The combobox-* fields below apply only to 'combobox'; the layout fields (direction/columns/maxSize/autoscroll) apply only to 'list'.",
        },
        direction: {
          type: "string",
          enum: ["vertical", "horizontal", "grid"],
          description: "list layout: 'vertical' (default, a column), 'horizontal' (a row), or 'grid' (N columns, see `columns`).",
        },
        columns: { type: "number", description: "list+grid: grid columns at DESKTOP width (default 2, min 1)." },
        columnsTablet: { type: "number", description: "list+grid: grid columns at TABLET width (768–1023px). Omit = same as `columns`." },
        columnsMobile: { type: "number", description: "list+grid: grid columns at MOBILE width (≤767px). Omit = same as `columns`." },
        gap: { type: "number", description: "list: gap between items in px (all directions, default 0)." },
        maxSize: {
          type: "number",
          description: "list: max size in px along the scroll axis — height for vertical/grid, width for horizontal. Content past it scrolls. Omit = grows to fit.",
        },
        autoscroll: { type: "boolean", description: "list: seamlessly auto-scroll the overflowing content in a loop (pauses on hover)." },
        autoscrollSpeed: {
          type: "string",
          enum: ["slow", "normal", "fast"],
          description: "list: auto-scroll speed (default 'normal').",
        },
        itemList: {
          type: "boolean",
          description:
            "list SEO: when true, emit ONE schema.org ItemList JSON-LD aggregating the rows " +
            "(instead of a separate per-row script). Only meaningful when the list `template` " +
            "is a JSON-LD-kind component (kind:'jsonld'); with a plain HTML template it does nothing.",
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
 * bind_component: { page, block, collection?, filter?, sort?, source?, request?,
 * params?, map? }. Omitting BOTH `collection` and `source` means "clear the
 * binding" (`clear: true`); `collection` → a collection binding; `source` (+
 * `request`) → an api-source binding (external-data-sources Slice 6).
 */
export interface BindComponentArgs {
  page: string;
  block: string;
  /** When true, remove the block's "item" binding (revert to static props). */
  clear: boolean;
  collection?: string;
  filter?: FilterClause[];
  sort?: SortClause[];
  /** api binding: the data source id or name (resolved in the dispatch handler). */
  source?: string;
  /** api binding: the saved request id or name. */
  request?: string;
  /** api binding: `{placeholder}` → literal or { prop } spec. */
  params?: ApiParamSpec;
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
  const source = str(rec, "source");
  if (collection && source) {
    return { ok: false, error: "pass either `collection` (collection binding) or `source` (API binding), not both" };
  }
  // No source of any kind → clear the binding.
  if (!collection && !source) return { ok: true, value: { page, block, clear: true } };

  const map = shapeMap(rec);
  if (!map.ok) return map;

  if (source) {
    const request = str(rec, "request");
    if (!request) {
      return { ok: false, error: "request (the saved request id or name) is required for an API binding — list_data_sources shows them" };
    }
    const params = shapeApiParams(rec);
    if (!params.ok) return params;
    return {
      ok: true,
      value: { page, block, clear: false, source, request, params: params.value, map: map.value },
    };
  }

  const filters = shapeFilters(rec);
  if (!filters.ok) return filters;
  const sort = shapeSort(rec);
  if (!sort.ok) return sort;

  return {
    ok: true,
    value: { page, block, clear: false, collection, filter: filters.value, sort: sort.value, map: map.value },
  };
}

/**
 * create_list: { page, section, template, map, collection? | source?+request?,
 * filter?, sort?, params?, itemsPath?, limit? }. Rows come from a collection OR
 * an api source (external-data-sources Slice 6) — exactly one of the two.
 */
export interface CreateListArgs {
  page: string;
  section: string;
  collection?: string;
  template: string;
  filter: FilterClause[];
  /** collection rows: free-text search (literal or route-value ref). See SEARCH_SCHEMA. */
  search?: unknown;
  sort: SortClause[];
  /** api rows: the data source id or name (resolved in the dispatch handler). */
  source?: string;
  /** api rows: the saved request id or name. */
  request?: string;
  /** api rows: `{placeholder}` → literal or { prop } spec. */
  params?: ApiParamSpec;
  /** api rows: dot-path to a nested rows array. */
  itemsPath?: string;
  limit?: number;
  map: Record<string, string>;
}

export function validateCreateList(args: unknown): ArgResult<CreateListArgs> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with page, section, template, map and a collection OR source+request" };
  const page = str(rec, "page");
  if (!page) return { ok: false, error: "page (id) is required" };
  const section = str(rec, "section");
  if (!section) return { ok: false, error: "section (block id) is required" };
  const template = str(rec, "template");
  if (!template) return { ok: false, error: "template (component name) is required" };

  const collection = str(rec, "collection");
  const source = str(rec, "source");
  if (collection && source) {
    return { ok: false, error: "pass either `collection` (collection rows) or `source` (API rows), not both" };
  }
  if (!collection && !source) {
    return { ok: false, error: "rows need a source: pass `collection` (table name) or `source`+`request` (API data source)" };
  }

  const map = shapeMap(rec);
  if (!map.ok) return map;

  if (source) {
    const request = str(rec, "request");
    if (!request) {
      return { ok: false, error: "request (the saved request id or name) is required for API rows — list_data_sources shows them" };
    }
    const params = shapeApiParams(rec);
    if (!params.ok) return params;
    return {
      ok: true,
      value: {
        page, section, template, source, request,
        params: params.value, itemsPath: str(rec, "itemsPath"),
        filter: [], sort: [], limit: shapeLimit(rec), map: map.value,
      },
    };
  }

  const filters = shapeFilters(rec);
  if (!filters.ok) return filters;
  const search = shapeSearch(rec);
  if (!search.ok) return search;
  const sort = shapeSort(rec);
  if (!sort.ok) return sort;

  return {
    ok: true,
    value: {
      page, section, collection, template, filter: filters.value, search: search.value,
      sort: sort.value, limit: shapeLimit(rec), map: map.value,
    },
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
  /** collection rows: free-text search (literal or route-value ref). See SEARCH_SCHEMA. */
  search?: unknown;
  sort?: SortClause[];
  /** api rows: the data source id or name (resolved in the dispatch handler). */
  source?: string;
  /** api rows: the saved request id or name. */
  request?: string;
  /** api rows: `{placeholder}` → literal or { prop } spec. */
  params?: ApiParamSpec;
  /** api rows: dot-path to a nested rows array. */
  itemsPath?: string;
  limit?: number;
  map?: Record<string, string>;
  // Presentation + combobox config (all optional, PATCH-like).
  presentation?: "list" | "combobox";
  // Plain-list layout.
  direction?: "vertical" | "horizontal" | "grid";
  columns?: number;
  columnsTablet?: number;
  columnsMobile?: number;
  gap?: number;
  maxSize?: number;
  autoscroll?: boolean;
  autoscrollSpeed?: "slow" | "normal" | "fast";
  /** Emit ONE schema.org ItemList JSON-LD over the rows (needs a jsonld template). */
  itemList?: boolean;
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

  // api-source patch fields (external-data-sources Slice 6).
  const source = str(rec, "source");
  if (collection && source) {
    return { ok: false, error: "pass either `collection` (collection rows) or `source` (API rows), not both" };
  }
  if (source) {
    out.source = source;
    const request = str(rec, "request");
    if (!request) {
      return { ok: false, error: "request (the saved request id or name) is required with `source` — list_data_sources shows them" };
    }
    out.request = request;
  }
  if (rec.params !== undefined) {
    const params = shapeApiParams(rec);
    if (!params.ok) return params;
    out.params = params.value;
  }
  const itemsPath = str(rec, "itemsPath");
  if (itemsPath) out.itemsPath = itemsPath;

  if (rec.filter !== undefined || rec.filters !== undefined) {
    const filters = shapeFilters(rec);
    if (!filters.ok) return filters;
    out.filter = filters.value;
  }
  if (rec.search !== undefined) {
    const search = shapeSearch(rec);
    if (!search.ok) return search;
    out.search = search.value;
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
  // Plain-list layout (each independently optional).
  const direction = str(rec, "direction");
  if (direction === "vertical" || direction === "horizontal" || direction === "grid") out.direction = direction;
  else if (direction) return { ok: false, error: 'direction must be "vertical", "horizontal", or "grid"' };
  if (typeof rec.columns === "number" && Number.isFinite(rec.columns)) out.columns = Math.max(1, Math.floor(rec.columns));
  if (typeof rec.columnsTablet === "number" && Number.isFinite(rec.columnsTablet)) out.columnsTablet = Math.max(1, Math.floor(rec.columnsTablet));
  if (typeof rec.columnsMobile === "number" && Number.isFinite(rec.columnsMobile)) out.columnsMobile = Math.max(1, Math.floor(rec.columnsMobile));
  if (typeof rec.gap === "number" && Number.isFinite(rec.gap)) out.gap = Math.max(0, rec.gap);
  if (typeof rec.maxSize === "number" && Number.isFinite(rec.maxSize)) out.maxSize = rec.maxSize;
  if (typeof rec.autoscroll === "boolean") out.autoscroll = rec.autoscroll;
  const autoscrollSpeed = str(rec, "autoscrollSpeed");
  if (autoscrollSpeed === "slow" || autoscrollSpeed === "normal" || autoscrollSpeed === "fast") out.autoscrollSpeed = autoscrollSpeed;
  else if (autoscrollSpeed) return { ok: false, error: 'autoscrollSpeed must be "slow", "normal", or "fast"' };
  if (typeof rec.itemList === "boolean") out.itemList = rec.itemList;
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
