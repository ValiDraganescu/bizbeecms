/**
 * Public guest-chat dispatch arg shaping (pure): query specs FORCE published +
 * live scope and drop non-field args; update lookups require every field; bodies
 * keep only declared fields. (node --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { guestQuerySpec, updateLookupFilters, guestBody, missingRequiredParams } from "./dispatch-core.ts";

// ── guestQuerySpec ────────────────────────────────────────────────────────────

test("guestQuerySpec forces published + live scope regardless of args", () => {
  const spec = guestQuerySpec(
    { status: "draft", archived: "all", city: "Oslo" },
    ["city", "cuisine"],
    20,
  );
  assert.equal(spec.status, "published");
  assert.equal(spec.archived, "live");
});

test("guestQuerySpec keeps the forced system status even when a USER field is named 'status'", () => {
  // Headline security claim: if a collection declares its own "status" column,
  // an arg on it becomes a plain eq FILTER — ANDed with the forced system
  // `spec.status`, so the result can only narrow, never widen to drafts.
  const spec = guestQuerySpec({ status: "draft" }, ["status", "city"], 20);
  assert.equal(spec.status, "published");
  assert.equal(spec.archived, "live");
  assert.deepEqual(spec.filters, [{ field: "status", op: "eq", value: "draft" }]);
});

test("guestQuerySpec turns declared fields into eq filters and drops unknown args", () => {
  const spec = guestQuerySpec(
    { city: "Oslo", cuisine: "thai", secretField: "x", limit: 5 },
    ["city", "cuisine"],
    20,
  );
  assert.deepEqual(spec.filters, [
    { field: "city", op: "eq", value: "Oslo" },
    { field: "cuisine", op: "eq", value: "thai" },
  ]);
});

test("guestQuerySpec clamps limit to [1, max] and keeps search", () => {
  assert.equal(guestQuerySpec({ limit: 999 }, [], 20).limit, 20);
  assert.equal(guestQuerySpec({ limit: 0 }, [], 20).limit, 1);
  assert.equal(guestQuerySpec({ limit: "nope" }, [], 20).limit, 20);
  assert.equal(guestQuerySpec({ search: "pizza" }, [], 20).search, "pizza");
  assert.equal(guestQuerySpec({ search: "   " }, [], 20).search, undefined);
});

// ── updateLookupFilters ───────────────────────────────────────────────────────

test("updateLookupFilters requires every declared lookup field", () => {
  const partial = updateLookupFilters({ email: "a@b.c" }, ["email", "code"]);
  assert.equal(partial.ok, false);
  assert.match((partial as { error: string }).error, /code/);

  const empty = updateLookupFilters({ email: "a@b.c", code: "" }, ["email", "code"]);
  assert.equal(empty.ok, false);
});

test("updateLookupFilters builds eq filters over all lookup fields", () => {
  const res = updateLookupFilters({ email: "a@b.c", code: "42" }, ["email", "code"]);
  assert.ok(res.ok);
  assert.deepEqual(res.filters, [
    { field: "email", op: "eq", value: "a@b.c" },
    { field: "code", op: "eq", value: "42" },
  ]);
});

// ── guestBody ─────────────────────────────────────────────────────────────────

test("guestBody keeps only declared fields and drops excluded/unknown", () => {
  const body = guestBody(
    { name: "Sam", note: "hi", status: "published", email: "a@b.c" },
    ["name", "note", "email"],
    ["email"], // lookup field excluded from the patch
  );
  assert.deepEqual(body, { name: "Sam", note: "hi" });
});

test("guestBody omits absent declared fields (PATCH semantics)", () => {
  assert.deepEqual(guestBody({ name: "Sam" }, ["name", "note"]), { name: "Sam" });
});

test("missingRequiredParams names required params left missing, empty, or whitespace", () => {
  assert.deepEqual(
    missingRequiredParams(["from", "to"], { email: "a@b.c", from: "", to: "  " }),
    ["from", "to"],
  );
  assert.deepEqual(
    missingRequiredParams(["from", "to"], { from: "2026-08-01", to: "2026-08-02" }),
    [],
  );
});

test("missingRequiredParams is a no-op for entries without requiredParams", () => {
  assert.deepEqual(missingRequiredParams(undefined, {}), []);
  assert.deepEqual(missingRequiredParams([], { from: "" }), []);
});
