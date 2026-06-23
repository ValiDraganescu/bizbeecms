import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema.ts";
import { fakeD1Returning } from "../test/fake-d1.ts";
import { checkReset, applyReset } from "./reset.ts";

/**
 * auth-reset C3 — BEHAVIORAL test of the CMS reset flow (mirrors PM P3).
 *
 * Drives the REAL `checkReset`/`applyReset` over the real drizzle-D1 client on a
 * fake D1 (real schema → real SQL → real bindings). CMS sessions live in the D1
 * `session` table (NOT KV like PM), so killing them is a plain INDEXED delete by
 * userId — asserted directly off the emitted SQL + param (no injected stub).
 * We assert the actual contract:
 *  - single-use: a second applyReset claim (guarded update → 0 rows) is rejected;
 *  - expired/used/notFound all collapse to a non-ok result the route maps to ONE
 *    generic error;
 *  - usedAt is set (the guarded update fires) and a fresh user hash is written;
 *  - the user's sessions are deleted by an indexed delete-by-userId;
 *  - the route never exposes the failure reason.
 *
 * `reset-logic.test.ts` covers the pure classifier boundaries; this file proves
 * the DB-driven wiring around it.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

const cfDb = (d1: unknown) => drizzle(d1 as D1Database, { schema });

const routeSrc = readFileSync(
  join(root, "src/app/api/auth/reset/route.ts"),
  "utf8",
);

/** A password_reset D1 row as drizzle reads it back (snake_case, epoch ints). */
const resetRow = (o: {
  id?: string;
  user_id?: string;
  token?: string;
  expires_at?: number;
  used_at?: number | null;
}) => ({
  id: o.id ?? "reset-1",
  user_id: o.user_id ?? "user-1",
  token: o.token ?? "tok-abc",
  expires_at: o.expires_at ?? Date.now() + 60_000,
  used_at: o.used_at ?? null,
  created_at: Date.now(),
});

test("checkReset reads a real select on password_reset keyed by token", async () => {
  const d1 = fakeD1Returning([
    { match: 'from "password_reset"', rows: [resetRow({ token: "tok-xyz" })] },
  ]);
  const { status, reset } = await checkReset("tok-xyz", cfDb(d1));

  // The real query hit the real (SINGULAR) table, bound by token.
  const sel = d1.calls.find((c) => /from "password_reset"/i.test(c.sql));
  assert.ok(sel, "expected a select on password_reset");
  assert.match(sel!.sql, /"token" = \?/i);
  assert.ok(sel!.params.includes("tok-xyz"));
  // A fresh, unused row classifies valid and maps the columns back through schema.
  assert.equal(status, "valid");
  assert.equal(reset?.userId, "user-1");
});

test("checkReset reports notFound when no row matches the token", async () => {
  const d1 = fakeD1Returning([]); // every read returns []
  const { status, reset } = await checkReset("missing", cfDb(d1));
  assert.equal(status, "notFound");
  assert.equal(reset, null);
});

test("checkReset reports expired for a row whose expiresAt is past", async () => {
  const d1 = fakeD1Returning([
    { match: 'from "password_reset"', rows: [resetRow({ expires_at: Date.now() - 1000 })] },
  ]);
  const { status } = await checkReset("tok-abc", cfDb(d1));
  assert.equal(status, "expired");
});

test("checkReset reports used for a row whose usedAt is set", async () => {
  const d1 = fakeD1Returning([
    { match: 'from "password_reset"', rows: [resetRow({ used_at: Date.now() - 1000 })] },
  ]);
  const { status } = await checkReset("tok-abc", cfDb(d1));
  assert.equal(status, "used");
});

test("applyReset on a valid token marks it used, writes a fresh hash, kills the user's sessions (indexed delete)", async () => {
  // select → returns the valid row; the guarded update → returns the marked row
  // (1 row ⇒ single-use claim succeeded).
  const d1 = fakeD1Returning([
    { match: 'from "password_reset"', rows: [resetRow({})] },
    { match: 'update "password_reset"', rows: [resetRow({ used_at: Date.now() })] },
  ]);
  const result = await applyReset("tok-abc", "a-new-password-123", cfDb(d1));

  assert.deepEqual(result, { ok: true });

  // The single-use claim was a guarded update on password_reset setting used_at.
  const upd = d1.calls.find((c) => /update "password_reset"/i.test(c.sql));
  assert.ok(upd, "expected a guarded update on password_reset");
  assert.match(upd!.sql, /"used_at" = \?/i);
  assert.match(upd!.sql, /"used_at" is null/i); // isNull guard ⇒ single-use

  // A fresh hash was written to the user row (PBKDF2 self-describing string).
  const userUpd = d1.calls.find((c) => /update "user"/i.test(c.sql));
  assert.ok(userUpd, "expected an update on user with the new hash");
  assert.ok(
    userUpd!.params.some((p) => typeof p === "string" && p.startsWith("pbkdf2$")),
    "a real PBKDF2 hash must be bound to the user update",
  );

  // CMS: the user's sessions are killed by a plain INDEXED delete-by-userId on the
  // D1 session table (no KV prefix-scan like PM). Assert it fires for the RIGHT user.
  const del = d1.calls.find((c) => /delete from "session"/i.test(c.sql));
  assert.ok(del, "expected an indexed delete from the session table");
  assert.match(del!.sql, /"user_id" = \?/i);
  assert.deepEqual(del!.params, ["user-1"]);
});

test("applyReset is single-use: a guarded update returning 0 rows rejects as used", async () => {
  // The token still selects as valid, but the guarded update claims 0 rows
  // (concurrent double-submit already spent it) ⇒ rejected, no hash, no session kill.
  const d1 = fakeD1Returning([
    { match: 'from "password_reset"', rows: [resetRow({})] },
    { match: 'update "password_reset"', rows: [] }, // 0 rows updated
  ]);
  const result = await applyReset("tok-abc", "a-new-password-123", cfDb(d1));

  assert.deepEqual(result, { ok: false, reason: "used" });
  // No user hash update and no session kill once the token claim failed.
  assert.ok(!d1.calls.some((c) => /update "user"/i.test(c.sql)), "must not rehash");
  assert.ok(
    !d1.calls.some((c) => /delete from "session"/i.test(c.sql)),
    "must not kill sessions when the token claim failed",
  );
});

test("applyReset rejects expired/used/notFound BEFORE any write (generic non-ok)", async () => {
  // Expired token: classified before the update, so nothing is mutated.
  const expired = fakeD1Returning([
    { match: 'from "password_reset"', rows: [resetRow({ expires_at: Date.now() - 1 })] },
  ]);
  const r1 = await applyReset("tok-abc", "a-new-password-123", cfDb(expired));
  assert.deepEqual(r1, { ok: false, reason: "expired" });
  assert.ok(!expired.calls.some((c) => /update "|delete from "/i.test(c.sql)), "expired ⇒ no writes");

  // notFound: empty read.
  const missing = fakeD1Returning([]);
  const r2 = await applyReset("nope", "a-new-password-123", cfDb(missing));
  assert.deepEqual(r2, { ok: false, reason: "notFound" });

  // used: a row already spent.
  const used = fakeD1Returning([
    { match: 'from "password_reset"', rows: [resetRow({ used_at: Date.now() - 1 })] },
  ]);
  const r3 = await applyReset("tok-abc", "a-new-password-123", cfDb(used));
  assert.deepEqual(r3, { ok: false, reason: "used" });

  // All three are non-ok; the route maps every non-ok to ONE generic error, so
  // no caller can tell expired/used/notFound apart.
  for (const r of [r1, r2, r3]) assert.equal(r.ok, false);
});

test("reset route maps every non-ok applyReset to ONE generic error, never the reason", () => {
  // The route is a thin handler that can't load under node --test (next + `@/`),
  // so we lock its branchless error mapping at the source. The BEHAVIOR (which
  // reasons exist, single-use, write ordering) is proven above against the real
  // fns; here we only assert the route can't leak which reason fired and uses the
  // CMS web `Response.json` (not PM's NextResponse).
  assert.match(routeSrc, /if \(!result\.ok\)[\s\S]*error: "resetTokenInvalid"/);
  assert.ok(!/result\.reason/.test(routeSrc), "route must not expose the failure reason");
  assert.match(routeSrc, /Response\.json\(/);
  assert.ok(!/NextResponse/.test(routeSrc), "CMS auth routes return web Response, not NextResponse");
  // Min-length is enforced via the CMS helper (not PM's validatePassword).
  assert.match(routeSrc, /isPasswordLongEnough\(password\)/);
  assert.match(routeSrc, /password !== confirm[\s\S]*passwordMismatch/);
});
