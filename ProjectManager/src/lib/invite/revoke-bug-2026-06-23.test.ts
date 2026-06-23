/**
 * Regression test for the 2026-06-23 P2 bug: PM had no way to cancel a pending
 * invitation. The route + store fn import `@/...` (not bare-node-importable —
 * see CAVEATS), so this asserts against source TEXT + the message JSONs, the
 * same strategy Slices 1/4/5 used. Fails-before (no DELETE route / no
 * deleteInvite / no i18n), passes-after.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const pmRoot = join(here, "..", "..", "..");
const read = (rel: string) => readFileSync(join(pmRoot, rel), "utf8");

test("DELETE /api/invite/[id] route exists and is gated by canUserInvite", () => {
  const route = read("src/app/api/invite/[id]/route.ts");
  assert.match(route, /export async function DELETE/);
  // Same authz as creating an invite (POST), re-enforced server-side.
  assert.match(route, /canUserInvite/);
  assert.match(route, /deleteInvite/);
  // 404 when the invite is gone / already accepted.
  assert.match(route, /404/);
});

test("deleteInvite store fn only removes PENDING invites", () => {
  const store = read("src/lib/invite/invite.ts");
  assert.match(store, /export async function deleteInvite/);
  // Must re-check the invite is still pending (acceptedAt IS NULL).
  assert.match(store, /isNull\(schema\.invites\.acceptedAt\)/);
});

test("pending table has a revoke control using the shared ConfirmDialog (no window.confirm)", () => {
  const ui = read("src/app/(app)/invite/pending-invites.tsx");
  assert.match(ui, /DELETE/);
  assert.match(ui, /\/api\/invite\//);
  // Confirm is the shared in-app dialog (promoted to components/ui), not a copy.
  assert.match(ui, /<ConfirmDialog/);
  assert.doesNotMatch(ui, /window\.confirm/);
  // The shared dialog carries the modal a11y + dims the page; never a native confirm() call.
  const dialog = read("src/components/ui/confirm-dialog.tsx");
  assert.match(dialog, /aria-modal="true"/);
  assert.doesNotMatch(dialog, /window\.confirm\(/);
});

test("revoke strings exist in EN/FI/ET", () => {
  for (const locale of ["en", "fi", "et"]) {
    const m = JSON.parse(read(`messages/${locale}.json`));
    const revoke = m.invites?.revoke;
    assert.ok(revoke, `${locale}: invites.revoke missing`);
    for (const key of ["action", "title", "body", "confirm", "cancel", "error"]) {
      assert.ok(revoke[key], `${locale}: invites.revoke.${key} missing`);
    }
    assert.match(revoke.body, /\{email\}/, `${locale}: revoke.body must take {email}`);
    assert.ok(m.invites.pending.actions, `${locale}: invites.pending.actions missing`);
  }
});
