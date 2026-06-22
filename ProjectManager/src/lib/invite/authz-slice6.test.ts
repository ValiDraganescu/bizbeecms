import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * pm-roles Slice 6 regression: the invite flow can grant the new roles
 * (Manager/Editor) and a Manager invite carries a tag scope, gated by the SAME
 * subset rule (`authorizeAssign`) the user-management API uses. The subset rule
 * itself is exercised in `lib/auth/manage-users.test.ts`; here we lock the
 * invite-specific wiring.
 *
 * NOTE: asserts against source TEXT (authz.ts/route.ts) + the message JSONs —
 * the lib/route modules use the `@/` path alias which Node's native TS stripping
 * doesn't resolve, so they aren't importable from a bare `node --test` (see
 * CAVEATS). Source-text assertions are the established pattern (roles.test.ts).
 */

const here = dirname(fileURLToPath(import.meta.url));
const authzSrc = readFileSync(join(here, "authz.ts"), "utf8");
const routeSrc = readFileSync(
  join(here, "..", "..", "app", "api", "invite", "route.ts"),
  "utf8",
);
const messagesDir = join(here, "..", "..", "..", "messages");

test("INVITABLE_ROLES grants Manager + Editor but never SuperAdmin", () => {
  const m = authzSrc.match(/INVITABLE_ROLES[^=]*=\s*\[([^\]]*)\]/);
  assert.ok(m, "INVITABLE_ROLES array found");
  const list = m![1];
  for (const r of ["Admin", "Manager", "Editor"]) {
    assert.ok(list.includes(`"${r}"`), `INVITABLE_ROLES includes ${r}`);
  }
  assert.ok(
    !list.includes("SuperAdmin"),
    "SuperAdmin must never be grantable via invite",
  );
});

test("authorizeInvite reuses authorizeAssign (single subset source of truth)", () => {
  assert.ok(
    authzSrc.includes("authorizeAssign"),
    "authz delegates the country+tag subset to authorizeAssign",
  );
  assert.ok(
    authzSrc.includes('role === "Manager" ? tagIds : []'),
    "tags are only granted for a Manager invite",
  );
});

test("invite route only parses tags for Manager invites + passes them through", () => {
  assert.ok(
    routeSrc.includes('role === "Manager" ? parseTagIds(body.tagIds) : []'),
    "route ignores tags for non-Manager roles",
  );
  assert.ok(
    routeSrc.includes("getUserTagIds"),
    "route loads the inviter's own tag scope for the subset check",
  );
  assert.ok(routeSrc.includes("tagIds,"), "route forwards tagIds to createInvite");
});

test("every locale carries the new invite tag strings", () => {
  for (const loc of ["en", "fi", "et"]) {
    const msgs = JSON.parse(
      readFileSync(join(messagesDir, `${loc}.json`), "utf8"),
    );
    const inv = msgs.invites;
    for (const key of ["tags", "tagsPlaceholder", "tagsHint"]) {
      assert.ok(inv.form[key], `${loc}: invites.form.${key} present`);
    }
    assert.ok(inv.pending.tags, `${loc}: invites.pending.tags present`);
    assert.ok(
      inv.errors.tagNotAllowed,
      `${loc}: invites.errors.tagNotAllowed present`,
    );
  }
});
