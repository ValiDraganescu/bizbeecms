/**
 * external-data-sources Slice 1 — CRUD store for `data_source` +
 * `data_source_request` (per-Site D1).
 *
 * Secrets are WRITE-ONLY (USER DECISION 2026-06-22): callers pass the plaintext
 * secret + the secret-box KEK (routes read `CMS_AUTH_SECRET`); we store the
 * AES-GCM blob and NEVER include it in the safe DTOs this store returns —
 * clients only ever see `hasSecret`. `decryptSourceSecret` exists for the
 * Slice-2 server-side fetch engine, never for a route response.
 *
 * Reads D1 ONLY via the `Db` port (`getDb()`), never `env.DB` (sole-reader
 * guard); `injectedDb` keeps it node-testable (google-client-store pattern).
 */
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import { decryptSecret, encryptSecret } from "../lib/crypto/secret-box.ts";
import type { SourceInput, RequestInput } from "../lib/data-sources/validate.ts";

/** What the API is allowed to see — no secretEnc, ever. */
export type SafeDataSource = {
  id: string;
  name: string;
  baseUrl: string;
  authType: string;
  authParam: string | null;
  hasSecret: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type SafeDataSourceRequest = {
  id: string;
  sourceId: string;
  name: string;
  method: string;
  path: string;
  query: Record<string, string>;
  bodyTemplate: string | null;
  cacheEnabled: boolean;
  cacheTtlSec: number;
  retryable: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toSafeSource(row: typeof schema.dataSource.$inferSelect): SafeDataSource {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    authType: row.authType,
    authParam: row.authParam,
    hasSecret: row.secretEnc != null && row.secretEnc !== "",
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSafeRequest(
  row: typeof schema.dataSourceRequest.$inferSelect,
): SafeDataSourceRequest {
  let query: Record<string, string> = {};
  try {
    const parsed = JSON.parse(row.query);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) query = parsed;
  } catch {
    // tolerate garbage — an unreadable query renders as empty, never throws
  }
  return {
    id: row.id,
    sourceId: row.sourceId,
    name: row.name,
    method: row.method,
    path: row.path,
    query,
    bodyTemplate: row.bodyTemplate,
    cacheEnabled: row.cacheEnabled,
    cacheTtlSec: row.cacheTtlSec,
    retryable: row.retryable,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/* -------------------------------------------------------------- sources */

export async function listDataSources(injectedDb?: Db): Promise<SafeDataSource[]> {
  const db = injectedDb ?? (await getDb());
  const rows = await db.select().from(schema.dataSource);
  return rows.map(toSafeSource);
}

export async function getDataSource(
  id: string,
  injectedDb?: Db,
): Promise<SafeDataSource | null> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select()
    .from(schema.dataSource)
    .where(eq(schema.dataSource.id, id))
    .limit(1);
  return rows[0] ? toSafeSource(rows[0]) : null;
}

export async function createDataSource(
  input: SourceInput,
  secret: string | null,
  kek: string,
  injectedDb?: Db,
): Promise<SafeDataSource> {
  const db = injectedDb ?? (await getDb());
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    name: input.name,
    baseUrl: input.baseUrl,
    authType: input.authType,
    authParam: input.authParam,
    secretEnc: secret ? await encryptSecret(secret, kek) : null,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.dataSource).values(row);
  return toSafeSource(row);
}

/**
 * Patch a source. `secret` semantics: `undefined` = keep the stored secret
 * (write-only field untouched), `null`/`""` = clear it, string = replace it.
 */
export async function updateDataSource(
  id: string,
  input: SourceInput,
  secret: string | null | undefined,
  kek: string,
  injectedDb?: Db,
): Promise<SafeDataSource | null> {
  const db = injectedDb ?? (await getDb());
  const existing = await db
    .select()
    .from(schema.dataSource)
    .where(eq(schema.dataSource.id, id))
    .limit(1);
  if (!existing[0]) return null;

  const secretEnc =
    secret === undefined
      ? existing[0].secretEnc
      : secret
        ? await encryptSecret(secret, kek)
        : null;
  const updated = {
    ...existing[0],
    name: input.name,
    baseUrl: input.baseUrl,
    authType: input.authType,
    authParam: input.authParam,
    secretEnc,
    updatedAt: new Date(),
  };
  await db
    .update(schema.dataSource)
    .set({
      name: updated.name,
      baseUrl: updated.baseUrl,
      authType: updated.authType,
      authParam: updated.authParam,
      secretEnc: updated.secretEnc,
      updatedAt: updated.updatedAt,
    })
    .where(eq(schema.dataSource.id, id));
  return toSafeSource(updated);
}

/** Delete a source (requests cascade via FK). Returns false if not found. */
export async function deleteDataSource(id: string, injectedDb?: Db): Promise<boolean> {
  const db = injectedDb ?? (await getDb());
  const existing = await db
    .select({ id: schema.dataSource.id })
    .from(schema.dataSource)
    .where(eq(schema.dataSource.id, id))
    .limit(1);
  if (!existing[0]) return false;
  await db.delete(schema.dataSource).where(eq(schema.dataSource.id, id));
  return true;
}

/**
 * SERVER-SIDE ONLY (Slice-2 fetch engine): the decrypted secret, or null when
 * none is set. Never route this to a Response.
 */
export async function decryptSourceSecret(
  id: string,
  kek: string,
  injectedDb?: Db,
): Promise<string | null> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select({ secretEnc: schema.dataSource.secretEnc })
    .from(schema.dataSource)
    .where(eq(schema.dataSource.id, id))
    .limit(1);
  const enc = rows[0]?.secretEnc;
  if (!enc) return null;
  return decryptSecret(enc, kek);
}

/* ------------------------------------------------------------- requests */

export async function listDataSourceRequests(
  sourceId: string,
  injectedDb?: Db,
): Promise<SafeDataSourceRequest[]> {
  const db = injectedDb ?? (await getDb());
  const rows = await db
    .select()
    .from(schema.dataSourceRequest)
    .where(eq(schema.dataSourceRequest.sourceId, sourceId));
  return rows.map(toSafeRequest);
}

export async function createDataSourceRequest(
  sourceId: string,
  input: RequestInput,
  injectedDb?: Db,
): Promise<SafeDataSourceRequest | null> {
  const db = injectedDb ?? (await getDb());
  const source = await db
    .select({ id: schema.dataSource.id })
    .from(schema.dataSource)
    .where(eq(schema.dataSource.id, sourceId))
    .limit(1);
  if (!source[0]) return null;
  const now = new Date();
  const row = {
    id: crypto.randomUUID(),
    sourceId,
    name: input.name,
    method: input.method,
    path: input.path,
    query: JSON.stringify(input.query),
    bodyTemplate: input.bodyTemplate,
    cacheEnabled: input.cacheEnabled,
    cacheTtlSec: input.cacheTtlSec,
    retryable: input.retryable,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(schema.dataSourceRequest).values(row);
  return toSafeRequest(row);
}

export async function updateDataSourceRequest(
  sourceId: string,
  requestId: string,
  input: RequestInput,
  injectedDb?: Db,
): Promise<SafeDataSourceRequest | null> {
  const db = injectedDb ?? (await getDb());
  const existing = await db
    .select()
    .from(schema.dataSourceRequest)
    .where(eq(schema.dataSourceRequest.id, requestId))
    .limit(1);
  if (!existing[0] || existing[0].sourceId !== sourceId) return null;
  const updated = {
    ...existing[0],
    name: input.name,
    method: input.method,
    path: input.path,
    query: JSON.stringify(input.query),
    bodyTemplate: input.bodyTemplate,
    cacheEnabled: input.cacheEnabled,
    cacheTtlSec: input.cacheTtlSec,
    retryable: input.retryable,
    updatedAt: new Date(),
  };
  await db
    .update(schema.dataSourceRequest)
    .set({
      name: updated.name,
      method: updated.method,
      path: updated.path,
      query: updated.query,
      bodyTemplate: updated.bodyTemplate,
      cacheEnabled: updated.cacheEnabled,
      cacheTtlSec: updated.cacheTtlSec,
      retryable: updated.retryable,
      updatedAt: updated.updatedAt,
    })
    .where(eq(schema.dataSourceRequest.id, requestId));
  return toSafeRequest(updated);
}

export async function deleteDataSourceRequest(
  sourceId: string,
  requestId: string,
  injectedDb?: Db,
): Promise<boolean> {
  const db = injectedDb ?? (await getDb());
  const existing = await db
    .select({ id: schema.dataSourceRequest.id, sourceId: schema.dataSourceRequest.sourceId })
    .from(schema.dataSourceRequest)
    .where(eq(schema.dataSourceRequest.id, requestId))
    .limit(1);
  if (!existing[0] || existing[0].sourceId !== sourceId) return false;
  await db
    .delete(schema.dataSourceRequest)
    .where(eq(schema.dataSourceRequest.id, requestId));
  return true;
}
