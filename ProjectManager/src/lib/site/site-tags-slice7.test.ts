import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

/**
 * pm-roles Slice 7 regression: the Site-detail tag picker. A Site can now carry
 * org tags (`site_tags`) via a PUT `/api/sites/[id]/tags` route + `setSiteTags`
 * helper, surfaced as an Admin+-gated multiselect on the Site detail page. This
 * closes the last functional gap in Manager reach (a Manager sees a Site only
 * when country matches AND a tag overlaps — without a way to tag Sites, that set
 * was always empty).
 *
 * NOTE: asserts against source TEXT + the message JSONs — site.ts/the route use
 * the `@/` path alias which Node's native TS stripping doesn't resolve, so they
 * aren't importable from a bare `node --test` (see CAVEATS). Source-text
 * assertions are the established pattern (authz-slice6.test.ts, roles.test.ts).
 */

const here = dirname(fileURLToPath(import.meta.url));
const siteSrc = readFileSync(join(here, "site.ts"), "utf8");
const routeSrc = readFileSync(
  join(here, "..", "..", "app", "api", "sites", "[id]", "tags", "route.ts"),
  "utf8",
);
const messagesDir = join(here, "..", "..", "..", "messages");

test("setSiteTags is a full-replace (delete-all + insert)", () => {
  const m = siteSrc.match(/export async function setSiteTags[\s\S]*?\n}/);
  assert.ok(m, "setSiteTags defined");
  const body = m![0];
  assert.ok(body.includes("delete(schema.siteTags)"), "deletes existing rows");
  assert.ok(body.includes("insert(schema.siteTags)"), "inserts the new set");
});

test("the tags route is Admin+ gated and re-validates tag ids", () => {
  assert.ok(
    routeSrc.includes("canUserCreateSite"),
    "route gates on the Admin+ helper",
  );
  assert.ok(
    routeSrc.includes("listTags()"),
    "route re-enforces ids against the managed vocabulary",
  );
  assert.ok(
    routeSrc.includes("setSiteTags(siteId, tagIds)"),
    "route persists the validated set",
  );
});

test("every locale carries the new Site tags strings", () => {
  for (const loc of ["en", "fi", "et"]) {
    const msgs = JSON.parse(
      readFileSync(join(messagesDir, `${loc}.json`), "utf8"),
    );
    const tags = msgs.sites.tags;
    assert.ok(tags, `${loc}: sites.tags present`);
    for (const key of ["title", "description", "label", "placeholder", "none", "save", "saved"]) {
      assert.ok(tags[key], `${loc}: sites.tags.${key} present`);
    }
  }
});
