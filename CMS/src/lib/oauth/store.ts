/**
 * D1 persistence for the OAuth 2.1 authorization server (cms-mcp → OAuth; port
 * of the ProjectManager store onto this Site's D1). Each deployed CMS Worker has
 * its own D1, so a grant here authorizes THIS one Site only (the DB IS the boundary).
 * CF-coupled (`getDb`) → not node-loadable; the pure rules live in `core.ts`.
 * Only HASHES of codes/tokens are stored; plaintexts are returned exactly once.
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/db";
import type { OauthClient, OauthToken } from "@/db/schema";
import {
  ACCESS_TTL_MS,
  CODE_TTL_MS,
  REFRESH_TTL_MS,
  hashToken,
  randomToken,
} from "./core";

export type ClientRecord = { id: string; name: string; redirectUris: string[]; createdAt: number };

const ms = (v: Date | number | null | undefined): number | null =>
  v == null ? null : v instanceof Date ? v.getTime() : Number(v);

function toClient(row: OauthClient): ClientRecord {
  let uris: string[] = [];
  try {
    const parsed = JSON.parse(row.redirectUris) as unknown;
    if (Array.isArray(parsed)) uris = parsed.filter((u): u is string => typeof u === "string");
  } catch {
    /* corrupt row → no URIs → nothing matches → safe */
  }
  return { id: row.id, name: row.name, redirectUris: uris, createdAt: ms(row.createdAt) ?? 0 };
}

// ── Clients ──────────────────────────────────────────────────────────────────
export async function createClient(name: string, redirectUris: string[]): Promise<ClientRecord> {
  const db = await getDb();
  const [row] = await db
    .insert(schema.oauthClient)
    .values({ id: randomToken("cid"), name, redirectUris: JSON.stringify(redirectUris) })
    .returning();
  return toClient(row);
}

export async function findClient(id: string): Promise<ClientRecord | null> {
  if (!id) return null;
  const db = await getDb();
  const [row] = await db.select().from(schema.oauthClient).where(eq(schema.oauthClient.id, id)).limit(1);
  return row ? toClient(row) : null;
}

// ── Authorization codes ──────────────────────────────────────────────────────
export async function createCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
}): Promise<string> {
  const db = await getDb();
  const code = randomToken("code");
  await db.insert(schema.oauthCode).values({
    codeHash: await hashToken(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    scope: input.scope,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

export type ConsumedCode = {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  scope: string;
};

/**
 * Atomically consume a code: marks it used and returns it ONLY if it was
 * unused + unexpired. A replayed code returns null (and, per OAuth 2.1, the
 * caller should revoke tokens minted from it — we do, see `revokeByCode`).
 */
export async function consumeCode(code: string): Promise<ConsumedCode | null> {
  const db = await getDb();
  const codeHash = await hashToken(code);
  const now = new Date();
  const rows = await db
    .update(schema.oauthCode)
    .set({ usedAt: now })
    .where(and(eq(schema.oauthCode.codeHash, codeHash), isNull(schema.oauthCode.usedAt)))
    .returning();
  const row = rows[0];
  if (!row) return null;
  if ((ms(row.expiresAt) ?? 0) < now.getTime()) return null;
  return {
    clientId: row.clientId,
    userId: row.userId,
    redirectUri: row.redirectUri,
    codeChallenge: row.codeChallenge,
    scope: row.scope,
  };
}

/** Was this code already used? (replay detection → revoke the grant) */
export async function codeWasUsed(code: string): Promise<boolean> {
  const db = await getDb();
  const [row] = await db
    .select({ usedAt: schema.oauthCode.usedAt })
    .from(schema.oauthCode)
    .where(eq(schema.oauthCode.codeHash, await hashToken(code)))
    .limit(1);
  return !!row && row.usedAt != null;
}

// ── Tokens ───────────────────────────────────────────────────────────────────
export type IssuedTokens = { accessToken: string; refreshToken: string; scope: string };

export async function issueTokens(input: {
  clientId: string;
  userId: string;
  scope: string;
}): Promise<IssuedTokens> {
  const db = await getDb();
  const accessToken = randomToken("at");
  const refreshToken = randomToken("rt");
  const now = Date.now();
  await db.insert(schema.oauthToken).values({
    id: crypto.randomUUID(),
    clientId: input.clientId,
    userId: input.userId,
    accessHash: await hashToken(accessToken),
    refreshHash: await hashToken(refreshToken),
    scope: input.scope,
    accessExpiresAt: new Date(now + ACCESS_TTL_MS),
    refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
  });
  return { accessToken, refreshToken, scope: input.scope };
}

/**
 * Refresh-token grant with ROTATION: the presented refresh token must be
 * active + unexpired; we swap in a fresh access+refresh pair on the same row
 * (so the old refresh token dies with this call). Returns null when the token
 * is unknown/revoked/expired or belongs to a different client.
 */
export async function rotateTokens(
  refreshToken: string,
  clientId: string | null,
): Promise<IssuedTokens | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.oauthToken)
    .where(eq(schema.oauthToken.refreshHash, await hashToken(refreshToken)))
    .limit(1);
  if (!row || row.revokedAt != null) return null;
  if ((ms(row.refreshExpiresAt) ?? 0) < Date.now()) return null;
  if (clientId && row.clientId !== clientId) return null;
  const accessToken = randomToken("at");
  const newRefresh = randomToken("rt");
  const now = Date.now();
  const updated = await db
    .update(schema.oauthToken)
    .set({
      accessHash: await hashToken(accessToken),
      refreshHash: await hashToken(newRefresh),
      accessExpiresAt: new Date(now + ACCESS_TTL_MS),
      refreshExpiresAt: new Date(now + REFRESH_TTL_MS),
    })
    // Guard against a concurrent rotation of the same row winning first.
    .where(and(eq(schema.oauthToken.id, row.id), eq(schema.oauthToken.refreshHash, row.refreshHash)))
    .returning({ id: schema.oauthToken.id });
  if (updated.length === 0) return null;
  return { accessToken, refreshToken: newRefresh, scope: row.scope };
}

/**
 * Resolve a presented ACCESS token → the grant row, only if active + unexpired.
 * Stamps lastUsedAt best-effort.
 */
export async function findActiveAccessToken(accessToken: string): Promise<OauthToken | null> {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(schema.oauthToken)
    .where(eq(schema.oauthToken.accessHash, await hashToken(accessToken)))
    .limit(1);
  if (!row || row.revokedAt != null) return null;
  if ((ms(row.accessExpiresAt) ?? 0) < Date.now()) return null;
  try {
    await db
      .update(schema.oauthToken)
      .set({ lastUsedAt: new Date() })
      .where(eq(schema.oauthToken.id, row.id));
  } catch {
    /* non-critical */
  }
  return row;
}

/** RFC 7009: revoke by either token string (access or refresh). Idempotent. */
export async function revokeByToken(token: string): Promise<void> {
  const db = await getDb();
  const h = await hashToken(token);
  await db
    .update(schema.oauthToken)
    .set({ revokedAt: new Date() })
    .where(eq(schema.oauthToken.accessHash, h));
  await db
    .update(schema.oauthToken)
    .set({ revokedAt: new Date() })
    .where(eq(schema.oauthToken.refreshHash, h));
}

// ── Connections UI (per user) ────────────────────────────────────────────────
export type ConnectionItem = {
  id: string;
  clientName: string;
  scope: string;
  createdAt: number;
  lastUsedAt: number | null;
  refreshExpiresAt: number;
};

/** A user's ACTIVE grants (unrevoked, refresh not yet expired), newest first. */
export async function listConnections(userId: string): Promise<ConnectionItem[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: schema.oauthToken.id,
      clientName: schema.oauthClient.name,
      scope: schema.oauthToken.scope,
      createdAt: schema.oauthToken.createdAt,
      lastUsedAt: schema.oauthToken.lastUsedAt,
      refreshExpiresAt: schema.oauthToken.refreshExpiresAt,
      revokedAt: schema.oauthToken.revokedAt,
    })
    .from(schema.oauthToken)
    .innerJoin(schema.oauthClient, eq(schema.oauthClient.id, schema.oauthToken.clientId))
    .where(eq(schema.oauthToken.userId, userId));
  const now = Date.now();
  return rows
    .filter((r) => r.revokedAt == null && (ms(r.refreshExpiresAt) ?? 0) >= now)
    .map((r) => ({
      id: r.id,
      clientName: r.clientName,
      scope: r.scope,
      createdAt: ms(r.createdAt) ?? 0,
      lastUsedAt: ms(r.lastUsedAt),
      refreshExpiresAt: ms(r.refreshExpiresAt) ?? 0,
    }))
    .sort((a, b) => b.createdAt - a.createdAt);
}

/** Revoke one of `userId`'s grants by id. False if not theirs / missing. */
export async function revokeConnection(userId: string, id: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .update(schema.oauthToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(schema.oauthToken.id, id), eq(schema.oauthToken.userId, userId)))
    .returning({ id: schema.oauthToken.id });
  return rows.length > 0;
}
