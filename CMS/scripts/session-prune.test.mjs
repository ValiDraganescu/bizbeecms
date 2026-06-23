/**
 * Tests for the CMS-local expired-session prune (cms-auth):
 *   STORE: `db/session-prune.ts` — `pruneExpiredSessions(now)` deletes every
 *   `session` row whose `expires_at <= now`, over real store logic against an
 *   in-memory node:sqlite fake-D1 (same shim the other store tests use). No
 *   Workers runtime, no live D1, no `next/headers`.
 *
 * dep-free node --test; the real `.ts` module imports via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { pruneExpiredSessions } from "../src/db/session-prune.ts";
import { cfDb } from "../src/lib/ports/db.ts";

const DDL = `
CREATE TABLE session (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL,
  expires_at integer NOT NULL
);
CREATE INDEX session_user_idx ON session (user_id);
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

function seed(fake, id, userId, expiresAtMs) {
  fake.sqlite
    .prepare("INSERT INTO session (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .run(id, userId, expiresAtMs - 1000, expiresAtMs);
}

test("prunes only rows expired at/before now", async () => {
  const fake = fakeD1();
  const db = cfDb(fake);
  const now = 50_000_000;
  const count = () => fake.sqlite.prepare("SELECT count(*) AS c FROM session").get().c;
  const has = (id) => !!fake.sqlite.prepare("SELECT id FROM session WHERE id = ?").get(id);

  seed(fake, "expired-old", "u1", now - 10_000); // long expired
  seed(fake, "expired-now", "u2", now); // exactly now → expired (lte)
  seed(fake, "live", "u3", now + 60_000); // still valid

  await pruneExpiredSessions(now, db);

  assert.equal(count(), 1);
  assert.equal(has("live"), true);
  assert.equal(has("expired-old"), false);
  assert.equal(has("expired-now"), false);
});

test("no-op when nothing is expired", async () => {
  const fake = fakeD1();
  const db = cfDb(fake);
  const now = 50_000_000;
  seed(fake, "a", "u1", now + 1);
  seed(fake, "b", "u2", now + 100_000);
  await pruneExpiredSessions(now, db);
  assert.equal(fake.sqlite.prepare("SELECT count(*) AS c FROM session").get().c, 2);
});
