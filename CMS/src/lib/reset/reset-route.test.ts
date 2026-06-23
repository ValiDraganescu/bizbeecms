import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * auth-reset C3 regression: CMS `POST /api/auth/reset` (mirrors PM P3).
 *
 * Like the C2 test, the route + lib import the `@/` alias which Node's native TS
 * stripping doesn't resolve under a bare `node --test`, so we assert against
 * source TEXT (the established repo pattern; genuine behavioral coverage of the
 * classifier lands in C5's `reset-logic.test.ts`). The contract we lock:
 *  - checkReset delegates to the pure classifier (existence/single-use/expiry);
 *  - applyReset re-validates, marks the token used under an isNull guard BEFORE
 *    hashing, sets a fresh hash, and invalidates the user's sessions;
 *  - CMS kills sessions with a plain indexed delete-by-userId (D1, not KV);
 *  - invalid/expired/used all return the SAME generic error (no detail leak);
 *  - the new password obeys the register/invite-accept min-length;
 *  - CMS uses SINGULAR Drizzle exports + web `Response.json` (not PM's plurals
 *    / NextResponse).
 */

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..", "..");

const resetSrc = readFileSync(join(here, "reset.ts"), "utf8");
const logicSrc = readFileSync(join(here, "reset-logic.ts"), "utf8");
const routeSrc = readFileSync(
  join(root, "src/app/api/auth/reset/route.ts"),
  "utf8",
);

test("checkReset delegates classification to classifyReset", () => {
  assert.match(resetSrc, /classifyReset\(reset\)/);
  assert.match(logicSrc, /export function classifyReset/);
});

test("applyReset enforces single-use via an isNull(usedAt) guarded update", () => {
  // SINGULAR passwordReset (CMS convention), guarded on usedAt still NULL.
  assert.match(
    resetSrc,
    /\.update\(schema\.passwordReset\)[\s\S]*isNull\(schema\.passwordReset\.usedAt\)/,
  );
  assert.match(
    resetSrc,
    /if \(marked\.length === 0\) return \{ ok: false, reason: "used" \}/,
  );
});

test("applyReset sets a fresh hash and invalidates the user's D1 sessions", () => {
  assert.match(resetSrc, /hashPassword\(newPassword\)/);
  assert.match(resetSrc, /\.update\(schema\.user\)[\s\S]*passwordHash/);
  // CMS: indexed delete-by-userId on the D1 session table (no prefix scan).
  assert.match(
    resetSrc,
    /\.delete\(schema\.session\)\.where\(eq\(schema\.session\.userId, reset\.userId\)\)/,
  );
  // Order: hash + session-kill happen only AFTER the token is marked used.
  const markIdx = resetSrc.indexOf("marked.length === 0");
  const hashIdx = resetSrc.indexOf("hashPassword(newPassword)");
  assert.ok(markIdx > 0 && hashIdx > markIdx, "mark-used must precede hashing");
});

test("reset route returns ONE generic error for invalid/expired/used", () => {
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

test("reset route enforces register/invite-accept min-length on the new password", () => {
  assert.match(routeSrc, /isPasswordLongEnough\(password\)/);
  assert.match(routeSrc, /password !== confirm[\s\S]*passwordMismatch/);
});

test("reset route uses web Response.json (CMS auth convention, not NextResponse)", () => {
  assert.match(routeSrc, /Response\.json\(/);
  assert.ok(
    !/NextResponse/.test(routeSrc),
    "CMS auth routes return web Response, not NextResponse",
  );
});
