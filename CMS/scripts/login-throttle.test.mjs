/**
 * Tests for CMS-local login brute-force throttling (cms-auth):
 *   - PURE: `lib/auth/throttle-core.ts` — sliding-window lockout decision.
 *   - STORE: `db/login-attempt-store.ts` — record/count/clear over real store
 *     logic against in-memory node:sqlite (the fake-D1 shim the other store
 *     tests use). No Workers runtime, no live D1.
 *
 * dep-free node --test; the real `.ts` modules import via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  decideThrottle,
  MAX_ATTEMPTS,
  WINDOW_MS,
} from "../src/lib/auth/throttle-core.ts";
import {
  recentFailureTimestamps,
  recordFailure,
  clearFailures,
} from "../src/db/login-attempt-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";

// ---- PURE throttle-core ------------------------------------------------------

test("not locked below the limit", () => {
  const now = 1_000_000;
  const fails = Array.from({ length: MAX_ATTEMPTS - 1 }, () => now - 1000);
  assert.deepEqual(decideThrottle(fails, now), { locked: false });
});

test("locked at the limit, retry-after is until the oldest ages out", () => {
  const now = 10_000_000;
  // MAX_ATTEMPTS failures, oldest 60s ago.
  const oldest = now - 60_000;
  const fails = [oldest, ...Array.from({ length: MAX_ATTEMPTS - 1 }, () => now - 1000)];
  const d = decideThrottle(fails, now);
  assert.equal(d.locked, true);
  assert.equal(d.retryAfterMs, oldest + WINDOW_MS - now);
});

test("failures outside the window don't count", () => {
  const now = 10_000_000;
  // All MAX_ATTEMPTS are older than the window → not locked.
  const fails = Array.from({ length: MAX_ATTEMPTS + 2 }, () => now - WINDOW_MS - 1);
  assert.deepEqual(decideThrottle(fails, now), { locked: false });
});

test("empty history is never locked", () => {
  assert.deepEqual(decideThrottle([], 1), { locked: false });
});

// ---- STORE lifecycle ---------------------------------------------------------

const DDL = `
CREATE TABLE login_attempt (
  id text PRIMARY KEY NOT NULL,
  email text NOT NULL,
  kind text DEFAULT 'login' NOT NULL,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE INDEX login_attempt_email_kind_idx ON login_attempt (email, kind);
`;

/** D1Database-shaped binding over in-memory node:sqlite. */
function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(DDL);
  return {
    sqlite,
    prepare(sql) {
      const stmt = sqlite.prepare(sql);
      const wrap = (params) => ({
        run: async () => {
          const r = stmt.run(...params);
          return { success: true, meta: { changes: r.changes }, results: [] };
        },
        all: async () => ({ success: true, results: stmt.all(...params) }),
        raw: async () => {
          const cols = stmt.columns().map((c) => c.name);
          return stmt.all(...params).map((row) => cols.map((c) => row[c]));
        },
        first: async () => stmt.get(...params) ?? null,
      });
      return { bind: (...params) => wrap(params), ...wrap([]) };
    },
  };
}

test("record → count → throttle → clear lifecycle", async () => {
  const db = cfDb(fakeD1());
  const email = "victim@example.com";
  const now = 50_000_000;

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await recordFailure(email, now - i * 1000, "login", db);
  }

  const ts = await recentFailureTimestamps(email, now, "login", db);
  assert.equal(ts.length, MAX_ATTEMPTS);
  assert.equal(decideThrottle(ts, now).locked, true);

  // A successful login clears the email's attempts → no longer locked.
  await clearFailures(email, "login", db);
  const after = await recentFailureTimestamps(email, now, "login", db);
  assert.equal(after.length, 0);
  assert.equal(decideThrottle(after, now).locked, false);
});

test("recentFailureTimestamps only returns in-window rows", async () => {
  const db = cfDb(fakeD1());
  const email = "user@example.com";
  const now = 50_000_000;
  await recordFailure(email, now - 1000, "login", db); // in window
  await recordFailure(email, now - WINDOW_MS - 5000, "login", db); // aged out
  const ts = await recentFailureTimestamps(email, now, "login", db);
  assert.equal(ts.length, 1);
});

test("attempts are per-email isolated", async () => {
  const db = cfDb(fakeD1());
  const now = 50_000_000;
  await recordFailure("a@example.com", now, "login", db);
  await recordFailure("a@example.com", now, "login", db);
  await recordFailure("b@example.com", now, "login", db);
  assert.equal((await recentFailureTimestamps("a@example.com", now, "login", db)).length, 2);
  assert.equal((await recentFailureTimestamps("b@example.com", now, "login", db)).length, 1);
});

test("recordFailure opportunistically prunes aged-out rows (any email/kind)", async () => {
  const fake = fakeD1();
  const db = cfDb(fake);
  const now = 50_000_000;
  const countAll = () => fake.sqlite.prepare("SELECT count(*) AS c FROM login_attempt").get().c;

  // Seed rows well past the window, across emails AND kinds.
  await recordFailure("old-a@example.com", now - WINDOW_MS - 10_000, "login", db);
  await recordFailure("old-b@example.com", now - WINDOW_MS - 10_000, "forgot", db);

  // A fresh in-window failure triggers the prune and itself survives.
  await recordFailure("fresh@example.com", now, "login", db);

  // Only the fresh row remains; both aged-out rows were swept.
  assert.equal(countAll(), 1);
  assert.equal((await recentFailureTimestamps("fresh@example.com", now, "login", db)).length, 1);
});

test("login and forgot namespaces are isolated (forgot-spam can't lock login)", async () => {
  const db = cfDb(fakeD1());
  const email = "victim@example.com";
  const now = 50_000_000;

  // Hammer the forgot endpoint up to (and past) the limit.
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await recordFailure(email, now - i * 1000, "forgot", db);
  }
  // forgot is now locked…
  const forgot = await recentFailureTimestamps(email, now, "forgot", db);
  assert.equal(decideThrottle(forgot, now).locked, true);
  // …but login for the same email is untouched.
  const login = await recentFailureTimestamps(email, now, "login", db);
  assert.equal(login.length, 0);
  assert.equal(decideThrottle(login, now).locked, false);

  // Clearing one namespace leaves the other intact.
  await clearFailures(email, "forgot", db);
  assert.equal((await recentFailureTimestamps(email, now, "forgot", db)).length, 0);
});
