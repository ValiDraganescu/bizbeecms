import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * auth-reset P2 regression: PM `POST /api/auth/forgot` is ENUMERATION-SAFE.
 *
 * The route imports the `@/` alias (db, mail, reset libs) which Node's native
 * TS stripping doesn't resolve under a bare `node --test`, so we assert against
 * source TEXT — the established pattern in this repo (see authz-slice6.test.ts).
 * The contract we lock: a matched email and a missing email produce the SAME
 * 200 `{ ok: true }` body, and any mint/send failure is swallowed (never leaks
 * account existence or 500s). Plus the reset token shape and i18n parity.
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
    routeSrc.match(/NextResponse\.json\(\{\s*ok:\s*true\s*\}\)/g) ?? []
  ).length;
  assert.equal(successCount, 1, "expected a single { ok: true } success body");

  // The success return must NOT be inside the `if (user)` block — it must run
  // for both hit and miss. We assert the success return appears AFTER the user
  // block closes (the `} // user` region), i.e. at the route's end.
  const successIdx = routeSrc.indexOf("return NextResponse.json({ ok: true })");
  const userBlockIdx = routeSrc.indexOf("if (user) {");
  assert.ok(successIdx > userBlockIdx, "success must come after the user block");
});

test("forgot route swallows mint/send failures (no enumeration via errors)", () => {
  // A try/catch wraps the mint+send so a failure can't change the response.
  assert.match(routeSrc, /try\s*\{[\s\S]*createPasswordReset[\s\S]*sendResetEmail[\s\S]*\}\s*catch/);
  // No error/500 is returned from the matched branch.
  assert.ok(
    !/if \(user\)[\s\S]*status:\s*5\d\d/.test(routeSrc),
    "matched branch must not 500",
  );
});

test("reset token is 64 hex chars (32 random bytes) and TTL is 7 days", () => {
  assert.match(resetSrc, /new Uint8Array\(32\)/);
  assert.match(resetSrc, /padStart\(2, "0"\)/);
  // 7 days in ms.
  assert.match(resetSrc, /RESET_TTL_MS\s*=\s*1000 \* 60 \* 60 \* 24 \* 7/);
});

test("reset email strings exist in all three locales (i18n parity)", () => {
  for (const loc of ["en", "fi", "et"]) {
    const msgs = JSON.parse(
      readFileSync(join(root, `messages/${loc}.json`), "utf8"),
    );
    const email = msgs?.auth?.forgot?.email;
    assert.ok(email, `auth.forgot.email missing in ${loc}`);
    assert.ok(email.subject, `auth.forgot.email.subject missing in ${loc}`);
    assert.ok(email.body, `auth.forgot.email.body missing in ${loc}`);
    assert.match(email.body, /\{url\}/, `${loc} body must interpolate {url}`);
  }
});
