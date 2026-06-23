import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema.ts";
import { fakeD1Returning } from "../test/fake-d1.ts";
import { createPasswordReset, newResetToken, RESET_TTL_MS } from "./reset.ts";

/**
 * auth-reset P2 — BEHAVIORAL test of the PM forgot flow.
 *
 * The mint half (`createPasswordReset`) is driven over the REAL drizzle-D1 client
 * on a fake D1 (real schema → real insert → real bindings), so we assert the row
 * it actually writes — 64-hex token, 7-day TTL, bound userId — not the source.
 *
 * The enumeration-safe property (hit and miss return the SAME body) lives in the
 * route, which can't load under node --test (next/server + `@/`); it's locked
 * STRUCTURALLY at the route source (exactly one `{ ok: true }`, returned after
 * the user block) — a runtime deep-equal of `{ok:true}` vs `{ok:true}` would be
 * tautological. The reset-email i18n bodies are executed against real data.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

const cfDb = (d1: unknown) => drizzle(d1 as D1Database, { schema });

test("newResetToken is 64 hex chars (32 random bytes)", () => {
  const tok = newResetToken();
  assert.match(tok, /^[0-9a-f]{64}$/);
  // Two mints don't collide (random source actually used).
  assert.notEqual(tok, newResetToken());
});

test("createPasswordReset inserts a real password_resets row with a 64-hex token + 7d TTL", async () => {
  const before = Date.now();
  // The insert ... returning reads back the row drizzle just bound; echo a row so
  // the fn has something to return (its values come from the bound params anyway).
  const d1 = fakeD1Returning([
    {
      match: 'insert into "password_resets"',
      rows: [
        {
          id: "r1",
          user_id: "user-9",
          token: "x".repeat(64),
          expires_at: before + RESET_TTL_MS,
          used_at: null,
          created_at: before,
        },
      ],
    },
  ]);

  await createPasswordReset("user-9", cfDb(d1));

  const ins = d1.calls.find((c) => /insert into "password_resets"/i.test(c.sql));
  assert.ok(ins, "expected an insert into the real password_resets table");
  // userId flows through to the bound params.
  assert.ok(ins!.params.includes("user-9"));
  // A 64-hex token was minted and bound.
  assert.ok(
    ins!.params.some((p) => typeof p === "string" && /^[0-9a-f]{64}$/.test(p)),
    "a 64-hex reset token must be bound",
  );
  // expiresAt is ~7 days out (bound as ms epoch; drizzle timestamp_ms).
  const expiry = ins!.params.find(
    (p) => typeof p === "number" && p >= before + RESET_TTL_MS - 5000,
  );
  assert.ok(
    typeof expiry === "number" && expiry <= Date.now() + RESET_TTL_MS + 5000,
    "expiresAt must be ~7 days from now",
  );
});

test("RESET_TTL_MS is exactly 7 days", () => {
  assert.equal(RESET_TTL_MS, 1000 * 60 * 60 * 24 * 7);
});

test("forgot route returns ONE success body, after the user block (enumeration-safe)", () => {
  // Structural lock: a single { ok: true }, returned unconditionally AFTER the
  // `if (user)` block — so hit and miss share the same response.
  const routeSrc = readFileSync(
    join(root, "src/app/api/auth/forgot/route.ts"),
    "utf8",
  );
  const successCount = (
    routeSrc.match(/NextResponse\.json\(\{\s*ok:\s*true\s*\}\)/g) ?? []
  ).length;
  assert.equal(successCount, 1, "expected a single { ok: true } success body");
  const successIdx = routeSrc.indexOf("return NextResponse.json({ ok: true })");
  const userBlockIdx = routeSrc.indexOf("if (user) {");
  assert.ok(successIdx > userBlockIdx, "success must come after the user block");

  // The mint+send is wrapped in try/catch so a failure can't change the response.
  assert.match(
    routeSrc,
    /try\s*\{[\s\S]*createPasswordReset[\s\S]*sendResetEmail[\s\S]*\}\s*catch/,
  );
  assert.ok(
    !/if \(user\)[\s\S]*status:\s*5\d\d/.test(routeSrc),
    "matched branch must not 500",
  );
});

test("reset email strings exist in all three locales and interpolate {url}", () => {
  for (const loc of ["en", "fi", "et"]) {
    const msgs = JSON.parse(readFileSync(join(root, `messages/${loc}.json`), "utf8"));
    const email = msgs?.auth?.forgot?.email;
    assert.ok(email, `auth.forgot.email missing in ${loc}`);
    assert.ok(email.subject, `auth.forgot.email.subject missing in ${loc}`);
    assert.ok(email.body, `auth.forgot.email.body missing in ${loc}`);
    assert.match(email.body, /\{url\}/, `${loc} body must interpolate {url}`);
  }
});
