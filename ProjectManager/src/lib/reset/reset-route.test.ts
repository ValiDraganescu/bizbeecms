import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * auth-reset P3 regression: PM `POST /api/auth/reset`.
 *
 * Like the P2 test, the route + lib import the `@/` alias which Node's native TS
 * stripping doesn't resolve under a bare `node --test`, so we assert against
 * source TEXT (the established repo pattern). The contract we lock:
 *  - the reset classifier gates on existence, single-use (usedAt), and expiry;
 *  - applyReset re-validates, marks the token used under an isNull guard, sets a
 *    fresh hash, and invalidates the user's sessions;
 *  - invalid/expired/used all return the SAME generic error (no detail leak);
 *  - new password obeys the register min-length; i18n parity for the error key.
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

const resetSrc = readFileSync(join(here, "reset.ts"), "utf8");
const logicSrc = readFileSync(join(here, "reset-logic.ts"), "utf8");
const routeSrc = readFileSync(
  join(root, "src/app/api/auth/reset/route.ts"),
  "utf8",
);
const sessionSrc = readFileSync(
  join(root, "src/lib/auth/session.ts"),
  "utf8",
);

test("checkReset delegates classification to classifyReset", () => {
  // The DB lookup stays in reset.ts; the decision lives in the pure module so
  // it's behaviorally testable (see reset-logic.test.ts).
  assert.match(resetSrc, /classifyReset\(reset\)/);
  assert.match(logicSrc, /export function classifyReset/);
});

test("applyReset enforces single-use via an isNull(usedAt) guarded update", () => {
  // The usedAt update is conditioned on usedAt still being NULL, so a concurrent
  // double-submit can't reuse the token; zero rows updated => rejected as used.
  assert.match(
    resetSrc,
    /\.update\(schema\.passwordResets\)[\s\S]*isNull\(schema\.passwordResets\.usedAt\)/,
  );
  assert.match(resetSrc, /if \(marked\.length === 0\) return \{ ok: false, reason: "used" \}/);
});

test("applyReset sets a fresh hash and invalidates the user's sessions", () => {
  assert.match(resetSrc, /hashPassword\(newPassword\)/);
  assert.match(resetSrc, /\.update\(schema\.users\)[\s\S]*passwordHash/);
  assert.match(resetSrc, /invalidateUserSessions\(reset\.userId\)/);
  // Order: hash + user update must happen only after the token is marked used.
  const markIdx = resetSrc.indexOf("marked.length === 0");
  const hashIdx = resetSrc.indexOf("hashPassword(newPassword)");
  assert.ok(markIdx > 0 && hashIdx > markIdx, "mark-used must precede hashing");
});

test("invalidateUserSessions scans the session prefix and deletes by userId", () => {
  assert.match(sessionSrc, /export async function invalidateUserSessions/);
  assert.match(sessionSrc, /kv\.list\(\{ prefix: KV_PREFIX/);
  assert.match(sessionSrc, /record\.userId === userId.*kv\.delete/s);
});

test("reset route returns ONE generic error for invalid/expired/used", () => {
  // All non-ok applyReset outcomes collapse to the same resetTokenInvalid body.
  assert.match(
    routeSrc,
    /if \(!result\.ok\)[\s\S]*error: "resetTokenInvalid"/,
  );
  // The route never branches its error message on the failure reason.
  assert.ok(
    !/result\.reason/.test(routeSrc),
    "route must not expose the failure reason (no detail leak)",
  );
});

test("reset route enforces register min-length on the new password", () => {
  assert.match(routeSrc, /validatePassword\(password\)/);
  assert.match(routeSrc, /password !== confirm[\s\S]*passwordMismatch/);
});

test("resetTokenInvalid error string exists in all three locales (i18n parity)", () => {
  for (const loc of ["en", "fi", "et"]) {
    const msgs = JSON.parse(
      readFileSync(join(root, `messages/${loc}.json`), "utf8"),
    );
    assert.ok(
      msgs?.auth?.errors?.resetTokenInvalid,
      `auth.errors.resetTokenInvalid missing in ${loc}`,
    );
  }
});
