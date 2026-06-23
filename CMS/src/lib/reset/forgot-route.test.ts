import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * auth-reset C2 regression: CMS `POST /api/auth/forgot` is ENUMERATION-SAFE.
 *
 * The route imports the `@/` alias (db, mail, reset libs) which Node's native
 * TS stripping doesn't resolve under a bare `node --test`, so we assert against
 * source TEXT — the established pattern in this repo. The contract we lock: a
 * matched email and a missing email produce the SAME 200 `{ ok: true }` body,
 * any mint/send failure is swallowed (never leaks account existence or 500s),
 * plus the reset token shape/TTL and i18n parity.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

const routeSrc = readFileSync(
  join(root, "src/app/api/auth/forgot/route.ts"),
  "utf8",
);
const resetSrc = readFileSync(join(here, "reset.ts"), "utf8");

test("forgot route returns the SAME success body whether or not email matched", () => {
  // Exactly one success response, returned unconditionally after the lookup.
  const successCount = (
    routeSrc.match(/Response\.json\(\{\s*ok:\s*true\s*\}\)/g) ?? []
  ).length;
  assert.equal(successCount, 1, "expected a single { ok: true } success body");

  // The success return must run for both hit and miss — it appears AFTER the
  // `if (user)` block, at the route's end.
  const successIdx = routeSrc.indexOf("return Response.json({ ok: true })");
  const userBlockIdx = routeSrc.indexOf("if (user) {");
  assert.ok(successIdx > userBlockIdx, "success must come after the user block");
});

test("forgot route swallows mint/send failures (no enumeration via errors)", () => {
  assert.match(
    routeSrc,
    /try\s*\{[\s\S]*createPasswordReset[\s\S]*sendResetEmail[\s\S]*\}\s*catch/,
  );
  // No 5xx is returned from the matched branch.
  assert.ok(
    !/if \(user\)[\s\S]*status:\s*5\d\d/.test(routeSrc),
    "matched branch must not 500",
  );
});

test("reset token is 64 hex chars (32 random bytes) and TTL is 7 days", () => {
  assert.match(resetSrc, /new Uint8Array\(32\)/);
  assert.match(resetSrc, /padStart\(2, "0"\)/);
  assert.match(resetSrc, /RESET_TTL_MS\s*=\s*1000 \* 60 \* 60 \* 24 \* 7/);
  // CMS uses the SINGULAR Drizzle export (passwordReset), not PM's plural.
  assert.match(resetSrc, /schema\.passwordReset\b/);
});

test("reset email strings exist in all three locales (i18n parity)", () => {
  for (const loc of ["en", "fi", "et"]) {
    const msgs = JSON.parse(
      readFileSync(join(root, `messages/${loc}.json`), "utf8"),
    );
    const email = msgs?.resetEmail;
    assert.ok(email, `resetEmail missing in ${loc}`);
    assert.ok(email.subject, `resetEmail.subject missing in ${loc}`);
    assert.ok(email.body, `resetEmail.body missing in ${loc}`);
    assert.match(email.body, /\{url\}/, `${loc} body must interpolate {url}`);
  }
});
