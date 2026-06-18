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
import { desc, eq } from "drizzle-orm";
import { getDb, schema } from "./index";
import type { Asset } from "./schema";
import { getStorage } from "@/lib/ports/storage";

/** List asset metadata, newest first. */
export async function listAssets(): Promise<Asset[]> {
  const db = await getDb();
  return db.select().from(schema.asset).orderBy(desc(schema.asset.createdAt));
}

/** Store bytes in R2 + a metadata row in D1, then return the row. */
export async function putAsset(input: {
  key: string;
  filename: string;
  contentType: string;
  bytes: ArrayBuffer;
}): Promise<Asset> {
  const storage = await getStorage();
  await storage.put(input.key, input.bytes, { contentType: input.contentType });

  const db = await getDb();
  const row: Asset = {
    id: crypto.randomUUID(),
    key: input.key,
    filename: input.filename,
    contentType: input.contentType,
    size: input.bytes.byteLength,
    createdAt: new Date(),
  };
  await db.insert(schema.asset).values(row);
  return row;
}

/** Delete an asset from R2 + D1 (best-effort R2; D1 row is the source of truth). */
export async function deleteAsset(key: string): Promise<void> {
  const storage = await getStorage();
  await storage.delete(key);
  const db = await getDb();
  await db.delete(schema.asset).where(eq(schema.asset.key, key));
}

/** Fetch raw bytes for the serve route. Returns null if absent. */
export async function getAssetObject(key: string): Promise<R2ObjectBody | null> {
  const storage = await getStorage();
  return storage.get(key);
}
