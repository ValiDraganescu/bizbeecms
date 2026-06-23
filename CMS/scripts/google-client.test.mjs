/**
 * Tests for per-Site Google OAuth client storage (cms-auth GOOGLE-CLIENT REWORK):
 *   - PURE: `lib/auth/google-config.ts` — validation, is-configured, normalize,
 *     status projection (never leaks the secret).
 *   - PURE: `lib/crypto/secret-box.ts` — AES-GCM encrypt/decrypt round-trip +
 *     tamper/wrong-key rejection.
 *   - STORE: `db/google-client-store.ts` — set → read-status → decrypt → clear,
 *     over a real `cfDb` on in-memory node:sqlite (the invite-store test pattern).
 *
 * dep-free node --test; the real `.ts` modules import via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

import {
  isValidClientId,
  isValidClientSecret,
  isGoogleConfigured,
  normalizeGoogleClientConfig,
  toGoogleClientStatus,
  emptyGoogleClientConfig,
} from "../src/lib/auth/google-config.ts";
import { encryptSecret, decryptSecret } from "../src/lib/crypto/secret-box.ts";
import {
  getGoogleClientConfig,
  setGoogleClientConfig,
  clearGoogleClientConfig,
  getDecryptedClientSecret,
} from "../src/db/google-client-store.ts";
import { cfDb } from "../src/lib/ports/db.ts";

// A valid 32-byte base64 KEK (matches CMS_AUTH_SECRET in prod).
const KEK = Buffer.alloc(32, 7).toString("base64");

// ---- PURE google-config ------------------------------------------------------

test("isValidClientId / isValidClientSecret reject empty + over-long, accept real", () => {
  assert.equal(isValidClientId(""), false);
  assert.equal(isValidClientId("   "), false);
  assert.equal(isValidClientId(123), false);
  assert.equal(isValidClientId("a".repeat(300)), false);
  assert.equal(isValidClientId("123-abc.apps.googleusercontent.com"), true);

  assert.equal(isValidClientSecret(""), false);
  assert.equal(isValidClientSecret("s".repeat(600)), false);
  assert.equal(isValidClientSecret("GOCSPX-abc"), true);
});

test("isGoogleConfigured needs BOTH id and encrypted secret", () => {
  assert.equal(isGoogleConfigured(emptyGoogleClientConfig()), false);
  assert.equal(isGoogleConfigured({ clientId: "x", clientSecretEnc: "" }), false);
  assert.equal(isGoogleConfigured({ clientId: "", clientSecretEnc: "blob" }), false);
  assert.equal(isGoogleConfigured({ clientId: "x", clientSecretEnc: "blob" }), true);
  assert.equal(isGoogleConfigured(null), false);
  assert.equal(isGoogleConfigured("nope"), false);
});

test("normalizeGoogleClientConfig trims id, tolerates garbage", () => {
  assert.deepEqual(normalizeGoogleClientConfig(null), emptyGoogleClientConfig());
  assert.deepEqual(normalizeGoogleClientConfig({ clientId: "  x  ", clientSecretEnc: "b" }), {
    clientId: "x",
    clientSecretEnc: "b",
  });
});

test("toGoogleClientStatus never exposes the secret blob", () => {
  const s = toGoogleClientStatus({ clientId: "x", clientSecretEnc: "SECRET_BLOB" });
  assert.equal(s.clientId, "x");
  assert.equal(s.hasSecret, true);
  assert.equal(s.configured, true);
  assert.equal(JSON.stringify(s).includes("SECRET_BLOB"), false);
});

// ---- PURE secret-box ---------------------------------------------------------

test("secret-box: encrypt → decrypt round-trips", async () => {
  const blob = await encryptSecret("GOCSPX-supersecret", KEK);
  assert.notEqual(blob, "GOCSPX-supersecret");
  assert.equal(await decryptSecret(blob, KEK), "GOCSPX-supersecret");
});

test("secret-box: wrong key + tampered blob throw, never leak", async () => {
  const blob = await encryptSecret("hi", KEK);
  const otherKey = Buffer.alloc(32, 9).toString("base64");
  await assert.rejects(() => decryptSecret(blob, otherKey));
  await assert.rejects(() => decryptSecret("AA==", KEK)); // too short
});

// ---- STORE over fake D1 ------------------------------------------------------

const DDL = `
CREATE TABLE site_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL DEFAULT 0
);
`;

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

test("store: set → status configured → decrypt → clear", async () => {
  const db = cfDb(fakeD1());

  // Unset → empty + not configured.
  const before = await getGoogleClientConfig(db);
  assert.equal(isGoogleConfigured(before), false);
  assert.equal(await getDecryptedClientSecret(KEK, db), null);

  // Set credentials.
  await setGoogleClientConfig("  my-client-id  ", "GOCSPX-abc", KEK, db);
  const after = await getGoogleClientConfig(db);
  assert.equal(after.clientId, "my-client-id"); // trimmed
  assert.equal(isGoogleConfigured(after), true);
  // Secret is encrypted at rest, NOT the plaintext.
  assert.notEqual(after.clientSecretEnc, "GOCSPX-abc");
  assert.equal(await getDecryptedClientSecret(KEK, db), "GOCSPX-abc");

  // Upsert again (not insert) — id changes, still one row.
  await setGoogleClientConfig("id2", "GOCSPX-xyz", KEK, db);
  assert.equal((await getGoogleClientConfig(db)).clientId, "id2");
  assert.equal(await getDecryptedClientSecret(KEK, db), "GOCSPX-xyz");

  // Clear → back to empty.
  await clearGoogleClientConfig(db);
  const cleared = await getGoogleClientConfig(db);
  assert.equal(isGoogleConfigured(cleared), false);
  assert.equal(await getDecryptedClientSecret(KEK, db), null);
});

test("store: wrong KEK → decrypt returns null, never throws", async () => {
  const db = cfDb(fakeD1());
  await setGoogleClientConfig("id", "GOCSPX-abc", KEK, db);
  const otherKey = Buffer.alloc(32, 1).toString("base64");
  assert.equal(await getDecryptedClientSecret(otherKey, db), null);
});
