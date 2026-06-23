/**
 * Tests for the CMS-local spent-reset prune (cms-auth):
 *   `lib/reset/reset.ts` — `pruneSpentResets(now)` deletes every `password_reset`
 *   row that is USED (`used_at IS NOT NULL`) or EXPIRED (`expires_at <= now`),
 *   over the real store logic against an in-memory node:sqlite fake-D1 (the same
 *   shim the other store tests use). No Workers runtime, no live D1.
 *
 * dep-free node --test; the real `.ts` module imports via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import { pruneSpentResets } from "../src/lib/reset/reset.ts";
import { cfDb } from "../src/lib/ports/db.ts";

const DDL = `
CREATE TABLE password_reset (
  id text PRIMARY KEY NOT NULL,
  user_id text NOT NULL,
  token text NOT NULL,
  expires_at integer NOT NULL,
  used_at integer,
  created_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
CREATE UNIQUE INDEX password_reset_token_unique ON password_reset (token);
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

function seed(fake, id, { expiresAtMs, usedAtMs = null }) {
  fake.sqlite
    .prepare(
      "INSERT INTO password_reset (id, user_id, token, expires_at, used_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run(id, "u1", `tok-${id}`, expiresAtMs, usedAtMs);
}

test("prunes used and expired rows, keeps a live unused one", async () => {
  const fake = fakeD1();
  const db = cfDb(fake);
  const now = 50_000_000;
  const count = () =>
    fake.sqlite.prepare("SELECT count(*) AS c FROM password_reset").get().c;
  const has = (id) =>
    !!fake.sqlite.prepare("SELECT id FROM password_reset WHERE id = ?").get(id);

  seed(fake, "used", { expiresAtMs: now + 60_000, usedAtMs: now - 1000 }); // used (still in-date)
  seed(fake, "expired", { expiresAtMs: now - 10_000 }); // expired, unused
  seed(fake, "expired-now", { expiresAtMs: now }); // exactly now → expired (lte)
  seed(fake, "live", { expiresAtMs: now + 60_000 }); // valid + unused → keep

  await pruneSpentResets(now, db);

  assert.equal(count(), 1, "only the live unused row survives");
  assert.equal(has("live"), true);
  assert.equal(has("used"), false);
  assert.equal(has("expired"), false);
  assert.equal(has("expired-now"), false);
});

test("no-op when every row is live and unused", async () => {
  const fake = fakeD1();
  const db = cfDb(fake);
  const now = 50_000_000;
  seed(fake, "a", { expiresAtMs: now + 1 });
  seed(fake, "b", { expiresAtMs: now + 100_000 });
  await pruneSpentResets(now, db);
  assert.equal(
    fake.sqlite.prepare("SELECT count(*) AS c FROM password_reset").get().c,
    2,
  );
});
