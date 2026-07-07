/**
 * D1 read/write for URL redirects (seo-robots).
 *
 * The pure matching logic (path normalization + lookup) lives in
 * `lib/render/redirects.ts` (node-testable). This store is the thin D1 seam:
 * `getRedirect` for the hot serving path (one indexed exact-match read on
 * `redirect_from_path_unique`), plus list/upsert/delete for the (later) admin
 * UI and auto-capture. `fromPath`/`toPath` are normalized before write so the
 * unique index and the lookup agree.
 */
import { eq } from "drizzle-orm";
import { getDb, schema, type Db } from "../lib/ports/db.ts";
import type { Redirect } from "./schema.ts";
import {
  normalizeRedirectPath,
  type RedirectHit,
  lookupRedirect,
} from "../lib/render/redirects.ts";

/** All redirects, newest first (admin list). */
export async function listRedirects(injectedDb?: Db): Promise<Redirect[]> {
  const db = injectedDb ?? (await getDb());
  return db.select().from(schema.redirect).orderBy(schema.redirect.createdAt);
}

/**
 * Resolve a redirect for a request path (hot serving path). One indexed exact
 * read on the normalized fromPath; the pure lookup applies the self-redirect
 * guard + status clamp. Returns null on a miss.
 */
export async function getRedirect(
  requestPath: string,
  injectedDb?: Db,
): Promise<RedirectHit | null> {
  const db = injectedDb ?? (await getDb());
  const from = normalizeRedirectPath(requestPath);
  const rows = await db
    .select({
      fromPath: schema.redirect.fromPath,
      toPath: schema.redirect.toPath,
      status: schema.redirect.status,
    })
    .from(schema.redirect)
    .where(eq(schema.redirect.fromPath, from))
    .limit(1);
  return lookupRedirect(from, rows);
}

/**
 * Upsert a redirect (normalized paths). On a duplicate `fromPath` the target +
 * status are overwritten (last write wins) — the unique index guarantees one
 * row per source. Drops self-redirects (from === to) rather than storing a loop.
 * Returns the stored row, or null if it was a self-redirect (skipped).
 */
export async function upsertRedirect(
  input: { fromPath: string; toPath: string; status?: number },
  injectedDb?: Db,
): Promise<Redirect | null> {
  const db = injectedDb ?? (await getDb());
  const fromPath = normalizeRedirectPath(input.fromPath);
  const toPath = normalizeRedirectPath(input.toPath);
  if (fromPath === toPath) return null; // self-redirect → loop; skip
  const status = input.status === 302 ? 302 : 301;
  const rows = await db
    .insert(schema.redirect)
    .values({ id: crypto.randomUUID(), fromPath, toPath, status })
    .onConflictDoUpdate({
      target: schema.redirect.fromPath,
      set: { toPath, status },
    })
    .returning();
  return rows[0] ?? null;
}

/** Delete a redirect by id. */
export async function deleteRedirect(id: string, injectedDb?: Db): Promise<void> {
  const db = injectedDb ?? (await getDb());
  await db.delete(schema.redirect).where(eq(schema.redirect.id, id));
}

/**
 * Apply the redirects a page rename produced (seo-robots auto-capture). For each
 * old→new path move:
 *   1. upsert a redirect old→new (the store normalizes + drops self-redirects),
 *   2. NO CHAINS: rewrite any EXISTING redirect whose target is an old path so
 *      it points straight at the new target (a→b existed, b→c now moves → a→c),
 *   3. any redirect that would now be a self-loop (from === new target) is
 *      deleted rather than left as a dead row.
 * Paths are normalized on both write and compare so the unique index + the
 * hot-path `getRedirect` match. Best-effort per row is the caller's concern; this
 * runs the whole batch in one D1 seam. Returns the count of redirects stored.
 */
export async function applyRenameRedirects(
  pairs: { from: string; to: string }[],
  injectedDb?: Db,
): Promise<number> {
  const db = injectedDb ?? (await getDb());
  if (pairs.length === 0) return 0;
  // Normalize once; build the old→new map for chain rewriting.
  const moves = pairs
    .map((p) => ({ from: normalizeRedirectPath(p.from), to: normalizeRedirectPath(p.to) }))
    .filter((p) => p.from !== p.to);
  if (moves.length === 0) return 0;
  const oldToNew = new Map(moves.map((m) => [m.from, m.to]));

  // 1. Store the new old→new redirects.
  let stored = 0;
  for (const m of moves) {
    const row = await upsertRedirect({ fromPath: m.from, toPath: m.to, status: 301 }, db);
    if (row) stored++;
  }

  // 2 + 3. Rewrite existing redirects that pointed AT an old path (no chains),
  //         then drop any that became a self-loop.
  const existing = await listRedirects(db);
  for (const r of existing) {
    const target = normalizeRedirectPath(r.toPath);
    const moved = oldToNew.get(target);
    if (moved === undefined) continue; // target didn't move
    const from = normalizeRedirectPath(r.fromPath);
    if (from === moved) {
      // Rewriting would create a self-loop → drop the row.
      await deleteRedirect(r.id, db);
    } else {
      await db
        .update(schema.redirect)
        .set({ toPath: moved })
        .where(eq(schema.redirect.id, r.id));
    }
  }
  return stored;
}
