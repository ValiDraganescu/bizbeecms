/**
 * Pure tests for the Form-block AI tool validators + the formTarget merge
 * (external-data-sources Form slice (d)) — node --test, no store/CF.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateCreateForm,
  validateBindForm,
  mergeFormTarget,
  CREATE_FORM_TOOL,
  BIND_FORM_TOOL,
} from "./form-tools.ts";

// ── validateCreateForm ────────────────────────────────────────────────────────

test("create_form: api target shapes source+request", () => {
  const r = validateCreateForm({
    page: "p1",
    section: "s1",
    source: "Contact API",
    request: "send-message",
    successMessage: "  Thanks!  ",
  });
  assert.ok(r.ok);
  assert.equal(r.value.source, "Contact API");
  assert.equal(r.value.request, "send-message");
  assert.equal(r.value.collection, undefined);
  assert.equal(r.value.successMessage, "Thanks!");
});

test("create_form: collection target shapes collection", () => {
  const r = validateCreateForm({ page: "p1", section: "s1", collection: "content_enquiries" });
  assert.ok(r.ok);
  assert.equal(r.value.collection, "content_enquiries");
  assert.equal(r.value.source, undefined);
});

test("create_form: rejects both / neither target kinds", () => {
  const both = validateCreateForm({
    page: "p", section: "s", collection: "content_x", source: "api", request: "r",
  });
  assert.equal(both.ok, false);
  assert.match((both as { error: string }).error, /not both/);
  const neither = validateCreateForm({ page: "p", section: "s" });
  assert.equal(neither.ok, false);
  assert.match((neither as { error: string }).error, /needs a target/);
});

test("create_form: api target without request is rejected", () => {
  const r = validateCreateForm({ page: "p", section: "s", source: "api" });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /request .* required/);
});

test("create_form: rejects missing page/section and non-objects", () => {
  for (const args of [{}, { section: "s", collection: "c" }, { page: "p", collection: "c" }, "nope", null, [1]]) {
    assert.equal(validateCreateForm(args).ok, false, `should reject ${JSON.stringify(args)}`);
  }
});

test("create_form: redirect must be a same-site path", () => {
  for (const redirect of ["https://evil.example", "//evil.example", "thanks"]) {
    const r = validateCreateForm({ page: "p", section: "s", collection: "c", redirect });
    assert.equal(r.ok, false, `should reject redirect ${redirect}`);
    assert.match((r as { error: string }).error, /same-site path/);
  }
  const ok = validateCreateForm({ page: "p", section: "s", collection: "c", redirect: "/thanks" });
  assert.ok(ok.ok);
  assert.equal(ok.value.redirect, "/thanks");
});

// ── validateBindForm ──────────────────────────────────────────────────────────

test("bind_form: clear wins over everything else", () => {
  const r = validateBindForm({ page: "p", block: "b", clear: true, collection: "c" });
  assert.ok(r.ok);
  assert.equal(r.value.clear, true);
  assert.equal(r.value.collection, undefined);
});

test("bind_form: messages-only patch is valid (no target change)", () => {
  const r = validateBindForm({ page: "p", block: "b", errorMessage: "Nope." });
  assert.ok(r.ok);
  assert.equal(r.value.clear, false);
  assert.equal(r.value.errorMessage, "Nope.");
  assert.equal(r.value.source, undefined);
});

test("bind_form: empty patch is rejected with guidance", () => {
  const r = validateBindForm({ page: "p", block: "b" });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /nothing to change/);
});

test("bind_form: rejects both target kinds / source without request", () => {
  const both = validateBindForm({ page: "p", block: "b", collection: "c", source: "s", request: "r" });
  assert.equal(both.ok, false);
  const noReq = validateBindForm({ page: "p", block: "b", source: "s" });
  assert.equal(noReq.ok, false);
  assert.match((noReq as { error: string }).error, /request .* required/);
});

// ── mergeFormTarget ───────────────────────────────────────────────────────────

test("mergeFormTarget: api patch drops collection fields, keeps messages", () => {
  const merged = mergeFormTarget(
    { kind: "collection", collection: "content_x", successMessage: "Yay" },
    { api: { sourceId: "src-1", requestId: "req-1" } },
  );
  assert.deepEqual(merged, {
    kind: "api",
    sourceId: "src-1",
    requestId: "req-1",
    successMessage: "Yay",
  });
});

test("mergeFormTarget: collection patch drops api ids", () => {
  const merged = mergeFormTarget(
    { kind: "api", sourceId: "src-1", requestId: "req-1", redirect: "/ok" },
    { collection: "content_enquiries", errorMessage: "Nope" },
  );
  assert.deepEqual(merged, {
    kind: "collection",
    collection: "content_enquiries",
    redirect: "/ok",
    errorMessage: "Nope",
  });
});

test("mergeFormTarget: messages-only patch keeps the stored target", () => {
  const merged = mergeFormTarget(
    { kind: "api", sourceId: "s", requestId: "r" },
    { successMessage: "Done!" },
  );
  assert.equal(merged.kind, "api");
  assert.equal(merged.sourceId, "s");
  assert.equal(merged.successMessage, "Done!");
});

test("mergeFormTarget: no prev + no target patch yields kind-less target", () => {
  const merged = mergeFormTarget(undefined, { successMessage: "x" });
  assert.equal(merged.kind, undefined); // handler rejects this case
});

// ── Tool schema sanity (names match the registry keys) ───────────────────────

test("tool schemas carry the registered names", () => {
  assert.equal(CREATE_FORM_TOOL.function.name, "create_form");
  assert.equal(BIND_FORM_TOOL.function.name, "bind_form");
});
