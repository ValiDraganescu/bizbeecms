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
import {
  COLLECTION_FIELD_TYPES,
  affinityFor,
  type CollectionFieldType,
} from "../content/collection-schema.ts";
import type { FieldPatch } from "../content/schema-rebuild.ts";

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
              translatable: {
                type: "boolean",
                description:
                  "Only valid for string/text/richtext. When true the field holds " +
                  "per-locale values (a locale object like {\"en\":\"…\",\"fi\":\"…\"}) and " +
                  "renders in the visitor's active content locale. Use it for guest-" +
                  "facing text (titles, descriptions, locations); leave off for codes, " +
                  "slugs, refs, and submission data.",
              },
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
      "ISO strings. Omit a field to use its default. A TRANSLATABLE field's value " +
      "may be either a plain string (stored as the default locale) OR a locale " +
      'object like {"en":"Cosy bistro","fi":"Viihtyisä bistro"} to set several ' +
      "languages at once.",
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
      "Find item ids with query_collection. A TRANSLATABLE field's value may be a " +
      'plain string (default locale) OR a locale object like {"en":"…","fi":"…"}.',
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
        limit: { type: "number", description: "Page size (1-1000, default 20). The result carries `total` — raise limit or pass offset for more." },
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

export const ADD_COLLECTION_FIELD_TOOL = {
  type: "function" as const,
  function: {
    name: "add_collection_field",
    description:
      "Add ONE new field (column) to an existing collection's schema, keeping all " +
      "existing data. Identify the collection by its table name (content_<slug>). " +
      "This is how you extend a collection — do NOT call create_collection for a " +
      "collection that already exists, and do NOT use rename_collection_field to " +
      "add a field. Field types: string, text, richtext, number, int, bool, date, " +
      "datetime, time, select, multiselect, ref, asset. For select/multiselect, " +
      "supply `options`. Call once per field to add several.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        name: { type: "string", description: "New field name (lowercase letters, digits, underscores; must start with a letter)." },
        type: { type: "string", description: "One of: string, text, richtext, number, int, bool, date, datetime, time, select, multiselect, ref, asset." },
        required: { type: "boolean", description: "Whether the field must be set on every item." },
        options: { type: "array", items: { type: "string" }, description: "Allowed values for select/multiselect." },
        translatable: {
          type: "boolean",
          description:
            "Only valid for string/text/richtext. When true the field stores per-" +
            'locale values (a locale object like {"en":"…","fi":"…"}) and renders in ' +
            "the visitor's active content locale.",
        },
      },
      required: ["collection", "name", "type"],
    },
  },
} as const;

// ── mcp-full-crud-patch T5: collection meta/field patch + guarded delete ──────

export const UPDATE_COLLECTION_TOOL = {
  type: "function" as const,
  function: {
    name: "update_collection",
    description:
      "Patch a collection's settings (address it by its content_<slug> table " +
      "name). Only the fields you pass change: omitted = keep the stored value, " +
      "null = clear. `label` renames the collection's DISPLAY name (the table " +
      "name never changes, so bindings and forms keep working). `description` " +
      "documents what the collection holds (null clears it). `publicSubmissions` " +
      "toggles whether PUBLIC visitors may submit items via a page Form block — " +
      "public submissions always land as DRAFTS for operator review regardless " +
      "of this toggle. To change fields, use update_collection_field / " +
      "add_collection_field / drop_collection_field / rename_collection_field.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        label: { type: "string", description: "New display name. Omit to keep (a collection always has one — it cannot be cleared)." },
        description: { type: "string", description: "What this collection holds. Omit to keep; null clears it." },
        publicSubmissions: { type: "boolean", description: "May public visitors submit items via a Form block? Submissions land as drafts regardless. null resets to false." },
      },
      required: ["collection"],
    },
  },
} as const;

export const UPDATE_COLLECTION_FIELD_TOOL = {
  type: "function" as const,
  function: {
    name: "update_collection_field",
    description:
      "Patch ONE existing field of a collection (by collection table name + " +
      "field name). Only the attributes you pass change: omitted = keep, null = " +
      "clear/reset (`required` null → false; `default`/`description` null → " +
      "removed). Changing `type` re-types the real column via a safe table " +
      "rebuild — existing row values are converted by SQLite's column-affinity " +
      "rules and the result names the exact coercion applied to the rows; no " +
      "data is dropped. Types: " + [...COLLECTION_FIELD_TYPES].join(", ") + ". " +
      "To rename a field use rename_collection_field; to remove one use " +
      "drop_collection_field.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        field: { type: "string", description: "The name of the user field to patch." },
        type: { type: "string", description: "New field type (re-types the column; existing values convert by SQLite affinity)." },
        required: { type: "boolean", description: "Whether the field must be set on every item. null resets to false." },
        default: { description: "New default value (string/number/boolean). null removes the default." },
        description: { type: "string", description: "What this field holds. Omit to keep; null clears it." },
      },
      required: ["collection", "field"],
    },
  },
} as const;

export const DELETE_COLLECTION_TOOL = {
  type: "function" as const,
  function: {
    name: "delete_collection",
    description:
      "PERMANENTLY delete a collection: drops its content_<slug> table with ALL " +
      "its items and removes it from the registry — no undo. BLOCKED while " +
      "anything references the collection — a block binding, List, form target, " +
      "or a chat agent's collections allowlist: the error names every " +
      "referencing place and the tool that clears each; remove them all, then " +
      "retry. There is no force flag.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
      },
      required: ["collection"],
    },
  },
} as const;

export const RESTORE_COLLECTION_ITEM_TOOL = {
  type: "function" as const,
  function: {
    name: "restore_collection_item",
    description:
      "Restore (un-archive) one ARCHIVED collection item by its id, making it " +
      "live again. Find archived items with query_collection archived:" +
      "'archived'. The reversal of archive_collection_item.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        id: { type: "string", description: "The archived item's id." },
      },
      required: ["collection", "id"],
    },
  },
} as const;

export const DELETE_COLLECTION_ITEM_TOOL = {
  type: "function" as const,
  function: {
    name: "delete_collection_item",
    description:
      "PERMANENTLY delete one collection item by its id — the row is destroyed " +
      "for good, with no undo. This is NOT archive_collection_item: archiving " +
      "is the safe, reversible default — prefer it unless the operator " +
      "explicitly wants the data gone.",
    parameters: {
      type: "object",
      properties: {
        collection: { type: "string", description: "The collection's table name (content_<slug>)." },
        id: { type: "string", description: "The item's id." },
      },
      required: ["collection", "id"],
    },
  },
} as const;

// ── Pure arg validation/coercion (no store, no CF — node-testable) ────────────

export type { ArgResult } from "./tool-args.ts";
import type { ArgResult } from "./tool-args.ts";

// Deliberately LOOSER than the shared `asRecord` (arrays pass through): the
// validators here answer array args with their field-specific "X is required"
// errors, which existing behavior/tests pin. Do not swap for the strict one.
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
  /** Opt-in per-locale text. The store's `normalizeField` drops this on any
   *  non-text type, so passing it through here is safe (no re-gating needed). */
  translatable?: boolean;
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
    if (f.translatable === true) out.translatable = true;
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

/** add_collection_field: { collection, name, type, required?, options? }. The
 *  store/planner enforce name shape, type validity, and collision rules; here we
 *  require collection+name+type and shape the field into a RawCollectionFieldArg. */
export function validateAddField(
  args: unknown,
): ArgResult<{ collection: string; field: RawCollectionFieldArg }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with collection, name and type" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  const name = str(rec, "name");
  if (!name) return { ok: false, error: "name (the new field name) is required" };
  const type = str(rec, "type");
  if (!type) return { ok: false, error: "type is required" };
  const field: RawCollectionFieldArg = { name, type };
  if (typeof rec.required === "boolean") field.required = rec.required;
  if (Array.isArray(rec.options)) {
    field.options = rec.options.filter((o): o is string => typeof o === "string");
  }
  if (rec.translatable === true) field.translatable = true;
  return { ok: true, value: { collection, field } };
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
  // Small default page for the AI tool (the compiler's own default is 1000, which
  // dumps a whole store into model context — the ~6.8k-token accidental query).
  // Only THIS tool path defaults to 20; REST/binding callers pass their own limit.
  else spec.limit = 20;
  if (typeof rec.offset === "number" && Number.isFinite(rec.offset)) spec.offset = rec.offset;
  else if (typeof rec.offset === "string" && rec.offset.trim() !== "" && Number.isFinite(Number(rec.offset))) spec.offset = Number(rec.offset);

  return { ok: true, value: { collection, spec } };
}

// ── update_collection (patch semantics: omitted=keep, null=clear) ────────────

/** A partial registry-metadata patch (matches the store's CollectionMetaPatch). */
export interface CollectionMetaPatchArg {
  name?: string;
  description?: string | null;
  publicSubmissions?: boolean;
}

const COLLECTION_PATCH_KEYS = ["label", "description", "publicSubmissions"] as const;

/** update_collection: { collection, label?, description?, publicSubmissions? }. */
export function validateUpdateCollection(
  args: unknown,
): ArgResult<{ collection: string; patch: CollectionMetaPatchArg }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with `collection` (the content_<slug> table name) plus the fields to change" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };

  const patch: CollectionMetaPatchArg = {};
  if ("label" in rec) {
    if (typeof rec.label !== "string" || rec.label.trim() === "") {
      return { ok: false, error: "`label` cannot be cleared — a collection always has a display name. Pass a new one, or omit `label` to keep the current one." };
    }
    patch.name = rec.label.trim();
  }
  if ("description" in rec) {
    if (rec.description === null || rec.description === "") patch.description = null;
    else if (typeof rec.description === "string") patch.description = rec.description;
    else return { ok: false, error: "`description` must be a string (or null to clear it)" };
  }
  if ("publicSubmissions" in rec) {
    if (rec.publicSubmissions !== null && typeof rec.publicSubmissions !== "boolean") {
      return { ok: false, error: "`publicSubmissions` must be a boolean (or null to reset to false). Public submissions always land as drafts." };
    }
    // null = reset to the default (off).
    patch.publicSubmissions = rec.publicSubmissions === true;
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: `nothing to change — pass at least one of ${COLLECTION_PATCH_KEYS.join(", ")} (omitted fields keep their stored values)` };
  }
  return { ok: true, value: { collection, patch } };
}

// ── update_collection_field (attribute patch; type change → table rebuild) ───

const FIELD_PATCH_KEYS = ["type", "required", "default", "description"] as const;

/** update_collection_field: { collection, field, type?, required?, default?, description? }. */
export function validateUpdateCollectionField(
  args: unknown,
): ArgResult<{ collection: string; field: string; patch: FieldPatch }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with `collection`, `field`, plus the attributes to change" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  const field = str(rec, "field");
  if (!field) return { ok: false, error: "field (the field's name) is required" };

  const patch: FieldPatch = {};
  if ("type" in rec) {
    if (typeof rec.type !== "string" || !COLLECTION_FIELD_TYPES.has(rec.type as CollectionFieldType)) {
      return { ok: false, error: `\`type\` ${JSON.stringify(rec.type)} is not valid — use one of: ${[...COLLECTION_FIELD_TYPES].join(", ")} (a field always has a type; omit \`type\` to keep the current one)` };
    }
    patch.type = rec.type as CollectionFieldType;
  }
  if ("required" in rec) {
    if (rec.required !== null && typeof rec.required !== "boolean") {
      return { ok: false, error: "`required` must be a boolean (or null to reset to false)" };
    }
    patch.required = rec.required as boolean | null;
  }
  if ("default" in rec) {
    const d = rec.default;
    if (d !== null && typeof d !== "string" && typeof d !== "number" && typeof d !== "boolean") {
      return { ok: false, error: "`default` must be a string, number, or boolean (or null to remove the default)" };
    }
    patch.default = d as string | number | boolean | null;
  }
  if ("description" in rec) {
    if (rec.description === null || rec.description === "") patch.description = null;
    else if (typeof rec.description === "string") patch.description = rec.description;
    else return { ok: false, error: "`description` must be a string (or null to clear it)" };
  }

  if (Object.keys(patch).length === 0) {
    return { ok: false, error: `nothing to change on field "${field}" — pass at least one of ${FIELD_PATCH_KEYS.join(", ")} (omitted attributes keep their stored values)` };
  }
  return { ok: true, value: { collection, field, patch } };
}

/**
 * Name the EXACT coercion a type change applies to existing rows. The rebuild
 * re-types the column and copies rows with a plain INSERT…SELECT, so the only
 * conversion is SQLite's column-affinity rule for the NEW type — this formatter
 * states that rule for the old→new affinity pair (no bespoke coercion path
 * exists to describe). `rowCount` is the number of copied rows when known.
 */
export function describeTypeCoercion(
  oldType: CollectionFieldType,
  newType: CollectionFieldType,
  rowCount: number | null,
): string {
  const from = affinityFor(oldType);
  const to = affinityFor(newType);
  let rule: string;
  if (from === to) {
    rule = `stored values are unchanged (both types are SQLite ${to} columns)`;
  } else if (to === "TEXT") {
    rule = `SQLite TEXT affinity re-stores each number as its text form (e.g. ${from === "REAL" ? "42.5 → '42.5'" : "42 → '42'"})`;
  } else if (from === "TEXT") {
    rule = `SQLite ${to} affinity converts numeric-looking text to numbers (e.g. '42' → 42); non-numeric text keeps its original text value`;
  } else if (to === "INTEGER") {
    rule = "SQLite INTEGER affinity stores whole numbers as integers (42.0 → 42); fractional values keep their REAL value (never rounded)";
  } else {
    rule = "SQLite REAL affinity re-stores each integer as floating point (42 → 42.0)";
  }
  const rows = rowCount === null ? "existing rows" : `${rowCount} ${rowCount === 1 ? "row" : "rows"}`;
  return `${rows}: ${oldType} → ${newType} — ${rule}`;
}

/**
 * update_collection_field pre-check error (G2 fix): making a field required
 * while existing rows hold NULL (and no default will backfill them) would
 * abort the table rebuild with a raw NOT NULL error. Self-correcting: names
 * the field, the NULL row count, and both fixes.
 */
export function requiredWithNullsMessage(field: string, nullCount: number): string {
  const rows = nullCount === 1 ? "1 existing item has" : `${nullCount} existing items have`;
  return (
    `cannot make field "${field}" required: ${rows} no value (NULL) for it. ` +
    `Either supply a \`default\` in the same update_collection_field call ` +
    `(existing NULL values are backfilled with it), or set a value on each ` +
    `item with update_collection_item (find them with query_collection ` +
    `filtering ${field} is_null), then retry.`
  );
}

// ── delete_collection / restore_collection_item / delete_collection_item ─────

/** delete_collection: { collection }. */
export function validateDeleteCollection(args: unknown): ArgResult<{ collection: string }> {
  const rec = asRecord(args);
  const collection = rec ? str(rec, "collection") : undefined;
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  return { ok: true, value: { collection } };
}

/** restore_collection_item / delete_collection_item: { collection, id }. */
export function validateItemRef(
  args: unknown,
): ArgResult<{ collection: string; id: string }> {
  const rec = asRecord(args);
  if (!rec) return { ok: false, error: "expected an object with collection and id" };
  const collection = str(rec, "collection");
  if (!collection) return { ok: false, error: "collection (table name) is required" };
  const id = str(rec, "id");
  if (!id) return { ok: false, error: "id is required — find item ids with query_collection" };
  return { ok: true, value: { collection, id } };
}
