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
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE INDEX login_attempt_email_idx ON login_attempt (email);
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
    await recordFailure(email, now - i * 1000, db);
  }

  const ts = await recentFailureTimestamps(email, now, db);
  assert.equal(ts.length, MAX_ATTEMPTS);
  assert.equal(decideThrottle(ts, now).locked, true);

  // A successful login clears the email's attempts → no longer locked.
  await clearFailures(email, db);
  const after = await recentFailureTimestamps(email, now, db);
  assert.equal(after.length, 0);
  assert.equal(decideThrottle(after, now).locked, false);
});

test("recentFailureTimestamps only returns in-window rows", async () => {
  const db = cfDb(fakeD1());
  const email = "user@example.com";
  const now = 50_000_000;
  await recordFailure(email, now - 1000, db); // in window
  await recordFailure(email, now - WINDOW_MS - 5000, db); // aged out
  const ts = await recentFailureTimestamps(email, now, db);
  assert.equal(ts.length, 1);
});

test("attempts are per-email isolated", async () => {
  const db = cfDb(fakeD1());
  const now = 50_000_000;
  await recordFailure("a@example.com", now, db);
  await recordFailure("a@example.com", now, db);
  await recordFailure("b@example.com", now, db);
  assert.equal((await recentFailureTimestamps("a@example.com", now, db)).length, 2);
  assert.equal((await recentFailureTimestamps("b@example.com", now, db)).length, 1);
});
