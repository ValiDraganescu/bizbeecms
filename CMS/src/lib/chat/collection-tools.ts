/**
 * content-collections — Slice 6: AI assistant collection tools (STRUCTURED only).
 *
 * The assistant can author components/pages/translations but had no way to manage
 * the operator's DATA collections. This module adds the five structured tools that
 * close that gap, each backed by an EXISTING store (Slices 2-4) — NO forked data
 * path, NO raw SQL ever reaches the model (USER DECISION, see CAVEATS):
 *
 *   - create_collection        → collection-store.createCollection(name, fields)
 *   - add_collection_item      → item-store.createItem(table, body)
 *   - update_collection_item   → item-store.updateItem(table, id, body)
 *   - archive_collection_item  → item-store.archiveItem / deleteItem (op-switched)
 *   - query_collection         → query-store.queryCollection(table, spec)
 *
 * Mirrors `list-assets-tool.ts`/`read-tools.ts`: the PURE concerns (tool schemas +
 * arg validation/coercion into the exact shapes the stores expect) live HERE so
 * they're unit-tested with the project's dep-free `node --test` (no `@/` alias
 * resolves there, hence the `.ts` relative imports). The CF-coupled store calls
 * are wired in `tool-dispatch.ts`.
 *
 * Validation philosophy: the stores ALREADY do the heavy lifting (cap/collision/
 * fence on create; per-field coerce+validate on items; column-whitelist on query).
 * These coercers just pull the model's args into the right SHAPE and reject the
 * obviously-malformed up front with a clear message the model can recover from —
 * they don't re-implement the registry validation.
 */
import { FILTER_OPS, type FilterOp, type QuerySpec } from "../content/query-compiler.ts";

// ── Tool schemas (OpenAI/Workers-AI function-calling shape) ───────────────────

export const CREATE_COLLECTION_TOOL = {
  type: "function" as const,
  function: {
    name: "create_collection",
    description:
      "Create a new typed data collection (a real table) the operator can fill " +
      "with content — e.g. 'Blog posts', 'Team members', 'Products'. Give it a " +
      "name and a list of typed fields. Each collection automatically gets system " +
      "fields (id, slug, status, created_at, updated_at), so only declare your " +
      "OWN content fields. Field types: string, text, richtext, number, int, " +
      "bool, date, datetime, time, select, multiselect, ref, asset. For select/" +
      "multiselect, supply `options` (an array of allowed string values).",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Display name of the collection (e.g. 'Blog posts')." },
        fields: {
          type: "array",
          description: "The collection's content fields.",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "Field name (lowercase letters, digits, underscores; must start with a letter)." },
              type: { type: "string", description: "One of: string, text, richtext, number, int, bool, date, datetime, time, select, multiselect, ref, asset." },
              required: { type: "boolean", description: "Whether the field must be set on every item." },
              options: { type: "array", items: { type: "string" }, description: "Allowed values for select/multiselect." },
            },
            required: ["name", "type"],
          },
        },
      },
      required: ["name", "fields"],
    },
  },
} as const;

export const ADD_COLLECTION_ITEM_TOOL = {
  type: "function" as const,
  function: {
    name: "add_collection_item",
    description:
      "Add one item (row) to a collection. Identify the collection by its table " +
      "name (use query_collection or the collections list — it looks like " +
      "content_<slug>). Pass `values` as an object of field-name → value matching " +
      "the collection's schema. Multiselect values are arrays; date/datetime are " +
      "ISO strings. Omit a field to use its default.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        values: { type: "object", description: "field name → value for this item." },
      },
      required: ["collection", "values"],
    },
  },
} as const;

export const UPDATE_COLLECTION_ITEM_TOOL = {
  type: "function" as const,
  function: {
    name: "update_collection_item",
    description:
      "Update fields on one existing collection item, addressed by its id. Only " +
      "the fields you pass in `values` change (PATCH semantics); omit the rest. " +
      "Find item ids with query_collection.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        id: { type: "string", description: "The item's id." },
        values: { type: "object", description: "field name → new value (only the fields to change)." },
      },
      required: ["collection", "id", "values"],
    },
  },
} as const;

export const ARCHIVE_COLLECTION_ITEM_TOOL = {
  type: "function" as const,
  function: {
    name: "archive_collection_item",
    description:
      "Archive (soft-hide, reversible), unarchive, or permanently delete one " +
      "collection item by its id. Prefer `archive` over `delete` — archived items " +
      "are hidden but recoverable; delete is permanent.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        id: { type: "string", description: "The item's id." },
        op: {
          type: "string",
          enum: ["archive", "unarchive", "delete"],
          description: "archive (default), unarchive, or delete.",
        },
      },
      required: ["collection", "id"],
    },
  },
} as const;

export const QUERY_COLLECTION_TOOL = {
  type: "function" as const,
  function: {
    name: "query_collection",
    description:
      "Query a collection's items with structured filters, sort, text search and " +
      "paging — returns the matching items + a total count. Filters are " +
      "{field, op, value}; ops: " + FILTER_OPS.join(", ") + ". `search` does a " +
      "simple text match across text fields. By default only live (non-archived) " +
      "items are returned.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        filters: {
          type: "array",
          description: "Filter clauses (ANDed).",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              op: { type: "string", enum: [...FILTER_OPS] },
              value: { description: "The comparison value (array for `in`; omit for is_null/not_null)." },
            },
            required: ["field", "op"],
          },
        },
        sort: {
          type: "array",
          description: "Sort clauses.",
          items: {
            type: "object",
            properties: {
              field: { type: "string" },
              dir: { type: "string", enum: ["asc", "desc"] },
            },
            required: ["field"],
          },
        },
        search: { type: "string", description: "Free-text search over text fields." },
        status: { type: "string", description: "Filter by status (e.g. draft|published)." },
        archived: { type: "string", enum: ["live", "archived", "all"], description: "Which items: live (default), archived, or all." },
        limit: { type: "number", description: "Page size (1-1000, default 1000)." },
        offset: { type: "number", description: "Row offset (default 0)." },
      },
      required: ["collection"],
    },
  },
} as const;

export const DROP_COLLECTION_FIELD_TOOL = {
  type: "function" as const,
  function: {
    name: "drop_collection_field",
    description:
      "Permanently remove one user-defined field (and its data) from a " +
      "collection's schema. Identify the collection by its table name " +
      "(content_<slug>). System fields (id, slug, status, created_at, " +
      "updated_at, archived_at) cannot be dropped. This rebuilds the table — " +
      "the field's column and all its values are gone for good.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        field: { type: "string", description: "The name of the user field to drop." },
      },
      required: ["collection", "field"],
    },
  },
} as const;

export const RENAME_COLLECTION_FIELD_TOOL = {
  type: "function" as const,
  function: {
    name: "rename_collection_field",
    description:
      "Rename one user-defined field of a collection, preserving its data. " +
      "Identify the collection by its table name (content_<slug>). System " +
      "fields cannot be renamed, and the new name must not collide with an " +
      "existing field. The new name is lowercase letters, digits and " +
      "underscores, starting with a letter.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        field: { type: "string", description: "The current name of the user field." },
        to: { type: "string", description: "The new field name." },
      },
      required: ["collection", "field", "to"],
    },
  },
} as const;

// ── Pure arg validation/coercion (no store, no CF — node-testable) ────────────

/** Result of validating a tool's args: a clean payload, or an error message. */
export type ArgResult<T> = { ok: true; value: T } | { ok: false; error: string };

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

/** Raw field descriptor as the model sends it (validated downstream by the store). */
export interface RawCollectionFieldArg {
  name: string;
  type: string;
  required?: boolean;
  options?: string[];
}

/** create_collection: { name, fields } — fields normalized to {name,type,required?,options?}. */
export function validateCreateCollection(
  args: unknown,
): ArgResult<{ name: string; fields: RawCollectionFieldArg[] }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with name and fields" };
  const name = str(rec, "name");
  if (!name) return { ok: false, error: "name is required" };
  if (!Array.isArray(rec.fields)) return { ok: false, error: "fields must be an array" };
  if (rec.fields.length === 0) return { ok: false, error: "a collection needs at least one field" };

  const fields: RawCollectionFieldArg[] = [];
  for (let i = 0; i < rec.fields.length; i++) {
    const f = asRecord(rec.fields[i]);
    if (!f) return { ok: false, error: `field ${i} must be an object` };
    const fname = str(f, "name");
    const ftype = str(f, "type");
    if (!fname) return { ok: false, error: `field ${i} is missing a name` };
    if (!ftype) return { ok: false, error: `field "${fname}" is missing a type` };
    const out: RawCollectionFieldArg = { name: fname, type: ftype };
    if (typeof f.required === "boolean") out.required = f.required;
    if (Array.isArray(f.options)) {
      out.options = f.options.filter((o): o is string => typeof o === "string");
    }
    fields.push(out);
  }
  return { ok: true, value: { name, fields } };
}

/** add_collection_item: { collection, values } → values must be a plain object. */
export function validateAddItem(
  args: unknown,
): ArgResult<{ collection: string; values: Record<string, unknown> }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with collection and values" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  const values = asRecord(rec.values);
  if (!values) return { ok: false, error: "values must be an object of field → value" };
  return { ok: true, value: { collection, values } };
}

/** update_collection_item: { collection, id, values }. */
export function validateUpdateItem(
  args: unknown,
): ArgResult<{ collection: string; id: string; values: Record<string, unknown> }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with collection, id and values" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  const id = str(rec, "id");
  if (!id) return { ok: false, error: "id is required" };
  const values = asRecord(rec.values);
  if (!values) return { ok: false, error: "values must be an object of field → value" };
  if (Object.keys(values).length === 0) return { ok: false, error: "values must name at least one field to change" };
  return { ok: true, value: { collection, id, values } };
}

/** drop_collection_field: { collection, field }. The store/planner enforce
 *  system-column + existence rules; here we only require both strings. */
export function validateDropField(
  args: unknown,
): ArgResult<{ collection: string; field: string }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with collection and field" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  const field = str(rec, "field");
  if (!field) return { ok: false, error: "field is required" };
  return { ok: true, value: { collection, field } };
}

/** rename_collection_field: { collection, field, to }. The planner enforces
 *  system-column/collision/name-shape rules; here we only require the strings. */
export function validateRenameField(
  args: unknown,
): ArgResult<{ collection: string; field: string; to: string }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with collection, field and to" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  const field = str(rec, "field");
  if (!field) return { ok: false, error: "field is required" };
  const to = str(rec, "to");
  if (!to) return { ok: false, error: "to (the new field name) is required" };
  return { ok: true, value: { collection, field, to } };
}

export type ArchiveOp = "archive" | "unarchive" | "delete";
const ARCHIVE_OPS = new Set<ArchiveOp>(["archive", "unarchive", "delete"]);

/** archive_collection_item: { collection, id, op? } — op defaults to "archive". */
export function validateArchiveItem(
  args: unknown,
): ArgResult<{ collection: string; id: string; op: ArchiveOp }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with collection and id" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  const id = str(rec, "id");
  if (!id) return { ok: false, error: "id is required" };
  const rawOp = str(rec, "op") ?? "archive";
  if (!ARCHIVE_OPS.has(rawOp as ArchiveOp)) {
    return { ok: false, error: `op must be one of archive, unarchive, delete (got "${rawOp}")` };
  }
  return { ok: true, value: { collection, id, op: rawOp as ArchiveOp } };
}

const FILTER_OP_SET = new Set<string>(FILTER_OPS);

/**
 * query_collection: { collection, ...QuerySpec }. Pulls the model's loose args
 * into a clean QuerySpec; the store's compiler does the column-whitelist + value
 * coercion, so here we only shape + reject malformed filter/sort clauses.
 */
export function validateQuery(
  args: unknown,
): ArgResult<{ collection: string; spec: QuerySpec }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with a collection" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };

  const spec: QuerySpec = {};

  if (rec.filters !== undefined) {
    if (!Array.isArray(rec.filters)) return { ok: false, error: "filters must be an array" };
    spec.filters = [];
    for (let i = 0; i < rec.filters.length; i++) {
      const f = asRecord(rec.filters[i]);
      if (!f) return { ok: false, error: `filter ${i} must be an object` };
      const field = str(f, "field");
      const op = str(f, "op");
      if (!field) return { ok: false, error: `filter ${i} is missing a field` };
      if (!op || !FILTER_OP_SET.has(op)) {
        return { ok: false, error: `filter on "${field}" has an invalid op (use ${FILTER_OPS.join(", ")})` };
      }
      spec.filters.push({ field, op: op as FilterOp, value: f.value });
    }
  }

  if (rec.sort !== undefined) {
    if (!Array.isArray(rec.sort)) return { ok: false, error: "sort must be an array" };
    spec.sort = [];
    for (let i = 0; i < rec.sort.length; i++) {
      const s = asRecord(rec.sort[i]);
      if (!s) return { ok: false, error: `sort ${i} must be an object` };
      const field = str(s, "field");
      if (!field) return { ok: false, error: `sort ${i} is missing a field` };
      const dir = str(s, "dir");
      spec.sort.push({ field, dir: dir === "desc" ? "desc" : dir === "asc" ? "asc" : undefined });
    }
  }

  const search = str(rec, "search");
  if (search) spec.search = search;
  const status = str(rec, "status");
  if (status) spec.status = status;
  const archived = str(rec, "archived");
  if (archived === "live" || archived === "archived" || archived === "all") spec.archived = archived;

  if (typeof rec.limit === "number" && Number.isFinite(rec.limit)) spec.limit = rec.limit;
  else if (typeof rec.limit === "string" && rec.limit.trim() !== "" && Number.isFinite(Number(rec.limit))) spec.limit = Number(rec.limit);
  if (typeof rec.offset === "number" && Number.isFinite(rec.offset)) spec.offset = rec.offset;
  else if (typeof rec.offset === "string" && rec.offset.trim() !== "" && Number.isFinite(Number(rec.offset))) spec.offset = Number(rec.offset);

  return { ok: true, value: { collection, spec } };
}
