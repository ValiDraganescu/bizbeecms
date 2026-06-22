/**
 * D1 persistence for per-Site API keys (cms-mcp Slice 2). CF-coupled (uses the
 * `Db` port → `env.DB`), so NOT node-loadable; the pure key crypto lives in
 * `lib/auth/api-key-core.ts` (node-tested). Each deployed CMS Worker has its own
 * D1, so a key here authorizes THIS one Site only (the DB IS the boundary).
 *
 * Only the HASH is stored. Creation returns the plaintext ONCE (the route shows
 * it and forgets it). Authentication looks a key up by its hash and rejects
 * revoked rows. Build-verified only; the live D1 write needs a real binding.
 */
import { eq } from "drizzle-orm";
import { getDb, schema } from "../lib/ports/db.ts";
import { generateKey, hashKey, keyPrefix } from "../lib/auth/api-key-core.ts";
import type { ApiKey } from "./schema.ts";

/** Row shape returned to the admin UI — never includes the hash or plaintext. */
export type ApiKeyListItem = {
  id: string;
  label: string;
  keyPrefix: string;
  createdBy: string | null;
  createdAt: number;
  lastUsedAt: number | null;
  revokedAt: number | null;
};

function toListItem(row: ApiKey): ApiKeyListItem {
  return {
    id: row.id,
    label: row.label,
    keyPrefix: row.keyPrefix,
    createdBy: row.createdBy ?? null,
    createdAt: row.createdAt instanceof Date ? row.createdAt.getTime() : Number(row.createdAt),
    lastUsedAt:
      row.lastUsedAt == null
        ? null
        : row.lastUsedAt instanceof Date
          ? row.lastUsedAt.getTime()
          : Number(row.lastUsedAt),
    revokedAt:
      row.revokedAt == null
        ? null
        : row.revokedAt instanceof Date
          ? row.revokedAt.getTime()
          : Number(row.revokedAt),
  };
}

/** List all keys (active + revoked), newest first, WITHOUT secrets. */
export async function listApiKeys(): Promise<ApiKeyListItem[]> {
  const db = await getDb();
  const rows = await db.select().from(schema.apiKey);
  return rows
    .map(toListItem)
    .sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Mint a new key. Returns the plaintext key ONCE (caller shows it and discards
 * it) plus the stored list item. Only the hash + display prefix are persisted.
 */
export async function createApiKey(
  label: string,
  createdBy: string | null,
): Promise<{ key: string; item: ApiKeyListItem }> {
  const db = await getDb();
  const key = generateKey();
  const row = {
    id: crypto.randomUUID(),
    keyHash: await hashKey(key),
    keyPrefix: keyPrefix(key),
    label: label.trim(),
    createdBy,
  };
  await db.insert(schema.apiKey).values(row);
  const [stored] = await db
    .select()
    .from(schema.apiKey)
    .where(eq(schema.apiKey.id, row.id));
  return { key, item: toListItem(stored) };
}

/** Revoke a key by id (idempotent). Returns true if a row was affected. */
export async function revokeApiKey(id: string): Promise<boolean> {
  const db = await getDb();
  const res = await db
    .update(schema.apiKey)
    .set({ revokedAt: new Date() })
    .where(eq(schema.apiKey.id, id));
  // D1 result exposes `meta.changes`; fall back to optimistic true.
  const changes = (res as unknown as { meta?: { changes?: number } })?.meta?.changes;
  return changes == null ? true : changes > 0;
}

/**
 * Look a key up by its HASH for authentication. Returns the row only if it
 * exists AND is not revoked; otherwise null. The guard hashes the presented
 * bearer (pure) then calls this. Also stamps `lastUsedAt` on a successful hit.
 */
export async function findActiveKeyByHash(keyHash: string): Promise<ApiKey | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.apiKey)
    .where(eq(schema.apiKey.keyHash, keyHash));
  if (!row || row.revokedAt != null) return null;
  // Best-effort usage stamp; don't fail auth if this write hiccups.
  try {
    await db
      .update(schema.apiKey)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.apiKey.id, row.id));
  } catch {
    /* ignore — usage tracking is non-critical */
  }
  return row;
}
