/**
 * Form submit-core (pure trust boundary): field collection + caps, form-block
 * lookup, api placeholder fill, collection body allowlist + forced draft,
 * rate decision, dual-mode detection, redirect building. (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  collectSubmission,
  findFormBlock,
  apiParamsFromFields,
  collectionBodyFromFields,
  decideFormRate,
  wantsJson,
  formRedirectUrl,
  MAX_FORM_FIELDS,
  MAX_FIELD_VALUE_LEN,
  FORM_RATE_MAX,
  FORM_RATE_WINDOW_MS,
} from "./submit-core.ts";
import type { Block } from "../render/plan-types.ts";

// ── collectSubmission ────────────────────────────────────────────────────────

test("collectSubmission splits identity fields from visitor fields", () => {
  const r = collectSubmission([
    ["__bb_page", "p1"],
    ["__bb_block", "b1"],
    ["name", "Ada"],
    ["email", "ada@example.com"],
  ]);
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.pageId, "p1");
  assert.equal(r.blockId, "b1");
  assert.deepEqual(r.fields, { name: "Ada", email: "ada@example.com" });
});

test("collectSubmission rejects missing identity, skips non-strings (files)", () => {
  const noId = collectSubmission([["name", "Ada"]]);
  assert.ok(!noId.ok && noId.status === 400);
  const withFile = collectSubmission([
    ["__bb_page", "p"],
    ["__bb_block", "b"],
    ["upload", { some: "file" }],
    ["n", 42],
  ]);
  assert.ok(withFile.ok);
  if (withFile.ok) assert.deepEqual(withFile.fields, { n: "42" });
});

test("collectSubmission enforces the field-count and value-length caps", () => {
  const many: Array<[string, unknown]> = [
    ["__bb_page", "p"],
    ["__bb_block", "b"],
  ];
  for (let i = 0; i <= MAX_FORM_FIELDS; i++) many.push([`f${i}`, "v"]);
  const tooMany = collectSubmission(many);
  assert.ok(!tooMany.ok && tooMany.status === 413);

  const tooLong = collectSubmission([
    ["__bb_page", "p"],
    ["__bb_block", "b"],
    ["msg", "x".repeat(MAX_FIELD_VALUE_LEN + 1)],
  ]);
  assert.ok(!tooLong.ok && tooLong.status === 413);
});

// ── findFormBlock ────────────────────────────────────────────────────────────

const tree: Block[] = [
  {
    id: "s1",
    component: "Section",
    children: [
      {
        id: "col",
        component: "__section_column__",
        children: [
          { id: "form1", component: "Form", formTarget: { kind: "api" } },
          { id: "hero", component: "Hero" },
        ],
      },
    ],
  },
];

test("findFormBlock finds a nested Form by id; non-Form ids yield null", () => {
  assert.equal(findFormBlock(tree, "form1")?.id, "form1");
  assert.equal(findFormBlock(tree, "hero"), null); // exists but isn't a Form
  assert.equal(findFormBlock(tree, "nope"), null);
});

// ── apiParamsFromFields ──────────────────────────────────────────────────────

test("apiParamsFromFields fills declared placeholders only; missing ones are named", () => {
  const ok = apiParamsFromFields(["city", "units"], { city: "Oslo", units: "metric", extra: "x" });
  assert.ok(ok.ok);
  if (ok.ok) assert.deepEqual(ok.params, { city: "Oslo", units: "metric" });

  const bad = apiParamsFromFields(["city", "units"], { city: "Oslo" });
  assert.ok(!bad.ok);
  if (!bad.ok) assert.match(bad.error, /units/);
});

// ── collectionBodyFromFields ─────────────────────────────────────────────────

test("collectionBodyFromFields keeps declared fields only and FORCES draft status", () => {
  const body = collectionBodyFromFields(
    { name: "Ada", message: "hi", status: "published", slug: "hack", rogue: "x" },
    ["name", "message"],
  );
  assert.deepEqual(body, { name: "Ada", message: "hi", status: "draft" });
});

// ── decideFormRate ───────────────────────────────────────────────────────────

test("decideFormRate locks at the max inside the window, frees as stamps age out", () => {
  const now = 1_000_000_000;
  const full = Array.from({ length: FORM_RATE_MAX }, () => now - 1000);
  assert.equal(decideFormRate(full, now).locked, true);
  assert.equal(decideFormRate(full.slice(1), now).locked, false);
  const aged = full.map(() => now - FORM_RATE_WINDOW_MS - 1);
  assert.equal(decideFormRate(aged, now).locked, false);
});

// ── wantsJson / formRedirectUrl ──────────────────────────────────────────────

test("wantsJson detects the fetch mode via Accept", () => {
  assert.equal(wantsJson("application/json"), true);
  assert.equal(wantsJson("text/html,application/xhtml+xml"), false);
  assert.equal(wantsJson(null), false);
});

test("formRedirectUrl: authored same-site path wins; else referer; else /; outcome appended", () => {
  assert.equal(
    formRedirectUrl({ redirect: "/thanks" }, "https://x.test/contact", true),
    "/thanks?bb_form=ok",
  );
  // Protocol-relative + non-path redirects are rejected (open-redirect guard).
  assert.equal(
    formRedirectUrl({ redirect: "//evil.test" }, "https://x.test/contact", true),
    "https://x.test/contact?bb_form=ok",
  );
  assert.equal(formRedirectUrl({}, null, false), "/?bb_form=error");
  assert.equal(
    formRedirectUrl({ redirect: "/thanks?a=1" }, null, true),
    "/thanks?a=1&bb_form=ok",
  );
});
