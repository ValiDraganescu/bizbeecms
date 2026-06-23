/**
 * Dep-free unit tests for the programmatic AI-translate request shaping
 * (lib/chat/translate-request.ts, ai-assistant goal):
 *  - parseTranslateRequest / resolveTargetLocales / buildTranslateMessages
 *  - collectStreamText / parseTranslateResponse
 * Run: node --test scripts/translate-request.test.mjs
 *
 * Pure path only — the model call + D1 write are HITL. The model is FAKED here
 * (a hand-built SSE stream); no live API.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseTranslateRequest,
  resolveTargetLocales,
  buildTranslateMessages,
  collectStreamText,
  parseTranslateResponse,
} from "../src/lib/chat/translate-request.ts";

// ── parseTranslateRequest ────────────────────────────────────────────────────
test("parseTranslateRequest: valid body", () => {
  const r = parseTranslateRequest({
    kind: "page",
    target: "pricing",
    fromLocale: "en",
    toLocales: ["fi", "et"],
    fields: { metaTitle: "Pricing" },
  });
  assert.ok(r.ok);
  assert.equal(r.request.kind, "page");
  assert.deepEqual(r.request.toLocales, ["fi", "et"]);
  assert.deepEqual(r.request.fields, { metaTitle: "Pricing" });
});

test("parseTranslateRequest: rejects bad kind / empty fields / bad locale", () => {
  const bad = parseTranslateRequest({ kind: "x", target: "", fromLocale: "zz", fields: {} });
  assert.equal(bad.ok, false);
  assert.ok(bad.errors.length >= 2);
});

test("parseTranslateRequest: field value must be a non-empty string", () => {
  const r = parseTranslateRequest({
    kind: "page",
    target: "home",
    fromLocale: "en",
    fields: { a: "" },
  });
  assert.equal(r.ok, false);
});

// ── resolveTargetLocales ─────────────────────────────────────────────────────
test("resolveTargetLocales: explicit list minus source, deduped", () => {
  assert.deepEqual(
    resolveTargetLocales("en", ["fi", "EN", "et", "fi"], ["en", "fi", "et"]),
    ["fi", "et"],
  );
});

test("resolveTargetLocales: defaults to site locales minus source", () => {
  assert.deepEqual(resolveTargetLocales("en", undefined, ["en", "fi", "et"]), ["fi", "et"]);
});

test("resolveTargetLocales: empty when only source configured", () => {
  assert.deepEqual(resolveTargetLocales("en", undefined, ["en"]), []);
});

// ── buildTranslateMessages ───────────────────────────────────────────────────
test("buildTranslateMessages: system + user mention fields and locales", () => {
  const msgs = buildTranslateMessages("en", ["fi", "et"], { metaTitle: "Pricing" });
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, "system");
  assert.match(msgs[1].content, /fi, et/);
  assert.match(msgs[1].content, /Pricing/);
});

// ── collectStreamText ────────────────────────────────────────────────────────
function fakeSseStream(chunks) {
  const enc = new TextEncoder();
  let i = 0;
  return new ReadableStream({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(enc.encode(chunks[i++]));
      else controller.close();
    },
  });
}

test("collectStreamText: concatenates deltas, ignores keep-alives", async () => {
  const stream = fakeSseStream([
    'data: {"choices":[{"delta":{"content":"{\\"metaTitle\\":"}}]}\n\n',
    ": keep-alive\n\n",
    'data: {"choices":[{"delta":{"content":"{\\"fi\\":\\"Hinnoittelu\\"}}"}}]}\n\n',
    "data: [DONE]\n\n",
  ]);
  const text = await collectStreamText(stream);
  assert.equal(text, '{"metaTitle":{"fi":"Hinnoittelu"}}');
});

// ── parseTranslateResponse ───────────────────────────────────────────────────
test("parseTranslateResponse: builds locale maps incl. source, no missing", () => {
  const text = '{"metaTitle":{"fi":"Hinnoittelu","et":"Hinnakiri"}}';
  const { fields, missing } = parseTranslateResponse(text, "en", ["fi", "et"], {
    metaTitle: "Pricing",
  });
  assert.deepEqual(fields.metaTitle, { en: "Pricing", fi: "Hinnoittelu", et: "Hinnakiri" });
  assert.deepEqual(missing, []);
});

test("parseTranslateResponse: tolerates prose / code fences around JSON", () => {
  const text = 'Sure! ```json\n{"a":{"fi":"X"}}\n``` done';
  const { fields } = parseTranslateResponse(text, "en", ["fi"], { a: "Y" });
  assert.deepEqual(fields.a, { en: "Y", fi: "X" });
});

test("parseTranslateResponse: reports missing locales per field", () => {
  const text = '{"a":{"fi":"X"}}';
  const { fields, missing } = parseTranslateResponse(text, "en", ["fi", "et"], { a: "Y" });
  assert.deepEqual(fields.a, { en: "Y", fi: "X" });
  assert.deepEqual(missing, ["a[et]"]);
});

test("parseTranslateResponse: unparseable text → source-only, all missing", () => {
  const { fields, missing } = parseTranslateResponse("nope", "en", ["fi"], { a: "Y" });
  assert.deepEqual(fields.a, { en: "Y" });
  assert.deepEqual(missing, ["a[fi]"]);
});

// ── regression: translate route must use the catalog (OpenRouter) DEFAULT_MODEL ──
// The route once hardcoded `@cf/meta/llama-3.1-8b-instruct`, which 502s against
// the OpenRouter adapter `getAi()` returns on every keyed Site. Guard that it now
// imports the catalog DEFAULT_MODEL and carries no `@cf/...` id.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { DEFAULT_MODEL } from "../src/lib/chat/models.ts";

test("translate route uses the catalog DEFAULT_MODEL, not a hardcoded @cf/ id", () => {
  const routePath = fileURLToPath(
    new URL("../src/app/api/translate/route.ts", import.meta.url),
  );
  const src = readFileSync(routePath, "utf8");
  assert.ok(
    /import\s*\{\s*DEFAULT_MODEL\s*\}\s*from\s*["']@\/lib\/chat\/models["']/.test(src),
    "translate route must import DEFAULT_MODEL from the model catalog",
  );
  assert.ok(!src.includes("@cf/"), "translate route must not hardcode a @cf/ model id");
  assert.ok(!DEFAULT_MODEL.startsWith("@cf/"), "catalog DEFAULT_MODEL is an OpenRouter id");
});
