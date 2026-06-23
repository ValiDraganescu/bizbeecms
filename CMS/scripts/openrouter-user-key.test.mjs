/**
 * Unit test for the CMS-local OpenRouter user-key (ai-openrouter KEY-MINTING
 * track, "CMS-local user-key override" slice). Two parts, both dep-free
 * node --test over real `.ts` via native type-stripping:
 *
 *  1) PURE helpers (`lib/settings/openrouter-key.ts`): validation (sk-or- prefix
 *     + bounds), normalize (defensive), status projection, and the request-time
 *     precedence rule (CMS-local user key wins over env key).
 *  2) The STORE (`db/openrouter-key-store.ts`) over a MOCKED `Db` port built (via
 *     the REAL `cfDb` adapter) on in-memory SQLite — proves the encrypt-at-rest
 *     round-trip, key-keyed upsert (no dup row), clear, and the decrypt path's
 *     null-on-failure (never throws). The key plaintext NEVER lands in D1.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  isValidUserKey,
  normalizeOpenrouterUserKey,
  toOpenrouterUserKeyStatus,
  effectiveOpenrouterKey,
  emptyOpenrouterUserKey,
} from "../src/lib/settings/openrouter-key.ts";
import {
  getOpenrouterUserKeyConfig,
  setOpenrouterUserKey,
  clearOpenrouterUserKey,
  getDecryptedOpenrouterUserKey,
} from "../src/db/openrouter-key-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";

// A 32-byte base64 KEK for secret-box (any constant works for the test).
const KEK = Buffer.alloc(32, 7).toString("base64");

// ── Part 1: pure helpers ──────────────────────────────────────────────────

test("isValidUserKey requires a bounded sk-or- string", () => {
  assert.equal(isValidUserKey("sk-or-v1-abc"), true);
  assert.equal(isValidUserKey("  sk-or-v1-abc  "), true, "trims before check");
  assert.equal(isValidUserKey("sk-abc"), false, "wrong prefix");
  assert.equal(isValidUserKey(""), false);
  assert.equal(isValidUserKey("   "), false);
  assert.equal(isValidUserKey("sk-or-" + "x".repeat(300)), false, "too long");
  assert.equal(isValidUserKey(123), false);
  assert.equal(isValidUserKey(null), false);
});

test("normalizeOpenrouterUserKey keeps the blob verbatim, defends bad input", () => {
  assert.deepEqual(normalizeOpenrouterUserKey({ keyEnc: "abc" }), { keyEnc: "abc" });
  assert.deepEqual(normalizeOpenrouterUserKey({}), emptyOpenrouterUserKey());
  assert.deepEqual(normalizeOpenrouterUserKey(null), emptyOpenrouterUserKey());
  assert.deepEqual(normalizeOpenrouterUserKey({ keyEnc: 5 }), emptyOpenrouterUserKey());
});

test("toOpenrouterUserKeyStatus never echoes the key, only hasKey", () => {
  assert.deepEqual(toOpenrouterUserKeyStatus({ keyEnc: "blob" }), { hasKey: true });
  assert.deepEqual(toOpenrouterUserKeyStatus({ keyEnc: "" }), { hasKey: false });
});

test("effectiveOpenrouterKey prefers the user key, falls back to env", () => {
  assert.equal(effectiveOpenrouterKey("sk-or-user", "sk-or-env"), "sk-or-user");
  assert.equal(effectiveOpenrouterKey("  sk-or-user  ", "sk-or-env"), "sk-or-user", "trims");
  assert.equal(effectiveOpenrouterKey("", "sk-or-env"), "sk-or-env", "empty user → env");
  assert.equal(effectiveOpenrouterKey("   ", "sk-or-env"), "sk-or-env", "blank user → env");
  assert.equal(effectiveOpenrouterKey(null, "sk-or-env"), "sk-or-env");
  assert.equal(effectiveOpenrouterKey(undefined, undefined), "", "neither → empty");
  assert.equal(effectiveOpenrouterKey(null, "  "), "", "blank env → empty");
});

// ── Part 2: store over a fake D1 ──────────────────────────────────────────

// Real `site_settings` DDL (matches the migration). Inline to keep dep-free.
const SETTINGS_DDL = `
CREATE TABLE site_settings (
  key text PRIMARY KEY NOT NULL,
  value text DEFAULT '{}' NOT NULL,
  updated_at integer DEFAULT (unixepoch() * 1000) NOT NULL
);
`;

/** A D1Database-shaped binding backed by in-memory node:sqlite (settings-store pattern). */
function fakeD1() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SETTINGS_DDL);
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

function rows(db) {
  return db.sqlite.prepare("SELECT * FROM site_settings").all();
}

test("getOpenrouterUserKeyConfig returns empty when nothing is stored (no write)", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);
  assert.deepEqual(await getOpenrouterUserKeyConfig(db), emptyOpenrouterUserKey());
  assert.equal(rows(d1).length, 0, "a read must not write");
});

test("set encrypts at rest, decrypt round-trips, status hides the key", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);
  const plaintext = "sk-or-v1-supersecret";

  await setOpenrouterUserKey(plaintext, KEK, db);

  const all = rows(d1);
  assert.equal(all.length, 1);
  assert.equal(all[0].key, "openrouter_user_key");
  const stored = JSON.parse(all[0].value);
  assert.ok(stored.keyEnc.length > 0, "an encrypted blob is stored");
  assert.equal(all[0].value.includes(plaintext), false, "plaintext NEVER lands in D1");

  // Decrypt round-trip with the right KEK.
  assert.equal(await getDecryptedOpenrouterUserKey(KEK, db), plaintext);

  // Status view exposes only hasKey.
  assert.deepEqual(
    toOpenrouterUserKeyStatus(await getOpenrouterUserKeyConfig(db)),
    { hasKey: true },
  );
});

test("setOpenrouterUserKey updates the same row in place (no dup)", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);
  await setOpenrouterUserKey("sk-or-one", KEK, db);
  await setOpenrouterUserKey("sk-or-two", KEK, db);
  assert.equal(rows(d1).length, 1, "key-keyed upsert, not a second row");
  assert.equal(await getDecryptedOpenrouterUserKey(KEK, db), "sk-or-two");
});

test("clear wipes the key; decrypt then returns null", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);
  await setOpenrouterUserKey("sk-or-gone", KEK, db);
  await clearOpenrouterUserKey(db);
  assert.deepEqual(await getOpenrouterUserKeyConfig(db), emptyOpenrouterUserKey());
  assert.equal(await getDecryptedOpenrouterUserKey(KEK, db), null);
});

test("getDecryptedOpenrouterUserKey returns null (never throws) on wrong KEK", async () => {
  const d1 = fakeD1();
  const db = cfDb(d1);
  await setOpenrouterUserKey("sk-or-x", KEK, db);
  const wrongKek = Buffer.alloc(32, 9).toString("base64");
  assert.equal(await getDecryptedOpenrouterUserKey(wrongKek, db), null);
});
