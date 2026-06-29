/**
 * R2 + D1 read/write for per-Site media assets (Milestone 2, epic D1).
 *
 * Bytes live in the `MEDIA` R2 bucket; a metadata row lives in D1 so the
 * gallery lists without an R2 LIST. Pure key/validation logic is in
 * `lib/render/asset.ts` (node-testable); this module owns the bindings.
 *
 * Build-verified only — live R2/D1 need real bindings (HITL). On Workers the
 * R2 binding is native: `env.MEDIA.put/get/delete`, no presigning.
 */
import { desc, eq, like, or } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import type { Asset } from "./schema";
import { getStorage, type Storage } from "../lib/ports/storage.ts";
import { serializeTags } from "../lib/components/tags.ts";

/**
 * List asset metadata, newest first. With a `query`, keyword-filters on the
 * AI-generated description, the filename, OR the operator tags (substring,
 * case-insensitive via SQL LIKE) — so the gallery is searchable by what an image
 * DEPICTS and by the labels you put on it.
 * ponytail: LIKE on the raw tags JSON string matches tag substrings well enough;
 * no FTS table until it measurably falls short.
 */
export async function listAssets(query?: string, injectedDb?: Db): Promise<Asset[]> {
  const db = injectedDb ?? (await getDb());
  const q = query?.trim();
  const base = db.select().from(schema.asset);
  const rows = q
    ? base.where(
        or(
          like(schema.asset.description, `%${q}%`),
          like(schema.asset.filename, `%${q}%`),
          like(schema.asset.tags, `%${q}%`),
        ),
      )
    : base;
  return rows.orderBy(desc(schema.asset.createdAt));
}

/** Store bytes in R2 + a metadata row in D1, then return the row. */
export async function putAsset(
  input: {
    key: string;
    filename: string;
    contentType: string;
    bytes: ArrayBuffer;
    /** AI description for search (optional; "" for non-images / not-yet-described). */
    description?: string;
  },
  injectedStorage?: Storage,
  injectedDb?: Db,
): Promise<Asset> {
  const storage = injectedStorage ?? (await getStorage());
  await storage.put(input.key, input.bytes, { contentType: input.contentType });

  const db = injectedDb ?? (await getDb());
  const row: Asset = {
    id: crypto.randomUUID(),
    key: input.key,
    filename: input.filename,
    contentType: input.contentType,
    size: input.bytes.byteLength,
    description: input.description ?? "",
    tags: "[]",
    createdAt: new Date(),
  };
  await db.insert(schema.asset).values(row);
  return row;
}

/** Update an asset's AI description (by key). Used when describe is deferred. */
export async function setAssetDescription(
  key: string,
  description: string,
  injectedDb?: Db,
): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await db
    .update(schema.asset)
    .set({ description })
    .where(eq(schema.asset.key, key));
}

/** Update an asset's operator tags (by key). Tags are normalized + serialized. */
export async function setAssetTags(
  key: string,
  tags: unknown,
  injectedDb?: Db,
): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await db
    .update(schema.asset)
    .set({ tags: serializeTags(tags) })
    .where(eq(schema.asset.key, key));
}

/** Delete an asset from R2 + D1 (best-effort R2; D1 row is the source of truth). */
export async function deleteAsset(
  key: string,
  injectedStorage?: Storage,
  injectedDb?: Db,
): Promise<void> {
  const storage = injectedStorage ?? (await getStorage());
  await storage.delete(key);
  const db = injectedDb ?? (await getDb());
  await db.delete(schema.asset).where(eq(schema.asset.key, key));
}

/** Fetch raw bytes for the serve route. Returns null if absent. */
export async function getAssetObject(
  key: string,
  injectedStorage?: Storage,
): Promise<R2ObjectBody | null> {
  const storage = injectedStorage ?? (await getStorage());
  return storage.get(key);
}
