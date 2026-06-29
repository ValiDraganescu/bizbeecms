/**
 * Shared Page Builder UI types (chrome state + collection/binding shapes) used by
 * the shell and its extracted panel components. Pure type aliases — no runtime.
 */

export type Viewport = "desktop" | "tablet" | "mobile";
export type CenterTab = "layers" | "preview";
export type RightTab = "block" | "page" | "seo";

/** A collection field descriptor (registry `CollectionView.fields[]` shape). */
export type CollectionFieldMeta = { name: string; type: string };
/** A collection registry view as the binding panels need it (`/api/collections`). */
export type CollectionMeta = { name: string; tableName: string; fields: CollectionFieldMeta[] };

/** A binding/list filter clause; matched against the Slice-4 query compiler ops. */
export type FilterClause = { field: string; op: string; value?: unknown };
/** A binding/list sort clause. */
export type SortClause = { field: string; dir?: "asc" | "desc" };

// Filter ops the Slice-4 query compiler whitelists (kept in step with it).
export const FILTER_OPS = [
  "eq",
  "ne",
  "lt",
  "lte",
  "gt",
  "gte",
  "like",
  "is_null",
  "not_null",
] as const;

/** All column names a collection exposes: its user fields + the 6 system columns. */
export function collectionColumns(c: CollectionMeta | undefined): string[] {
  if (!c) return [];
  const sys = ["id", "slug", "status", "archived_at", "created_at", "updated_at"];
  return [...c.fields.map((f) => f.name), ...sys];
}
