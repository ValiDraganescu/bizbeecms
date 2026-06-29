/**
 * Dep-free unit tests for the create-component tool's pure parts (epic B2):
 * the artifact validator + the tool-call SSE delta accumulator.
 * Run: node --test scripts/component-tool.test.mjs
 *
 * Imports the TS modules directly via Node type-stripping (project convention;
 * no @/ alias — that's why component-tool.ts imports render/* relatively).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateComponentArtifact,
  CREATE_COMPONENT_TOOL,
} from "../src/lib/chat/component-tool.ts";
import {
  ToolCallAccumulator,
  extractToolCall,
  parseLine,
} from "../src/lib/chat/sse.ts";

// ── tool schema ──────────────────────────────────────────────────────────────
test("CREATE_COMPONENT_TOOL: well-formed OpenAI function schema", () => {
  assert.equal(CREATE_COMPONENT_TOOL.type, "function");
  assert.equal(CREATE_COMPONENT_TOOL.function.name, "create_component");
  assert.deepEqual(CREATE_COMPONENT_TOOL.function.parameters.required, [
    "name",
    "html",
  ]);
});

// ── validateComponentArtifact: happy path ────────────────────────────────────
test("validate: accepts a valid artifact (html + allowed classes)", () => {
  const res = validateComponentArtifact({
    name: "PricingCard",
    html: '<div class="flex flex-col p-4">Hello</div>',
    script: "console.log('hi')",
    css: "block",
  });
  assert.equal(res.ok, true);
  assert.equal(res.artifact.name, "PricingCard");
});

test("validate: html-only artifact defaults script/css to empty", () => {
  const res = validateComponentArtifact({
    name: "Box",
    html: "<span>x</span>",
  });
  assert.equal(res.ok, true);
  assert.equal(res.artifact.script, "");
  assert.equal(res.artifact.css, "");
});

// ── propsSchema (preview placeholder data) ───────────────────────────────────
test("validate: keeps a propsSchema object as a canonical JSON string", () => {
  const res = validateComponentArtifact({
    name: "Hero",
    html: "<h1>{{title}}</h1>",
    propsSchema: { title: { type: "string", default: "Launch faster" } },
  });
  assert.equal(res.ok, true);
  assert.equal(
    res.artifact.propsSchema,
    JSON.stringify({ title: { type: "string", default: "Launch faster" } }),
  );
});

test("validate: accepts propsSchema given as a JSON STRING", () => {
  const res = validateComponentArtifact({
    name: "Hero",
    html: "<h1>{{title}}</h1>",
    propsSchema: JSON.stringify({ title: { type: "string", default: "Hi" } }),
  });
  assert.equal(res.ok, true);
  assert.ok(res.artifact.propsSchema.includes("Hi"));
});

test("validate: a translatable slot {{t title}} is accepted in html", () => {
  const res = validateComponentArtifact({
    name: "Hero",
    html: "<h1>{{t title}}</h1>",
    propsSchema: { title: { type: "string", default: "Hi", translatable: true } },
  });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

test("validate: an empty propsSchema is dropped (no point storing it)", () => {
  const res = validateComponentArtifact({
    name: "Static",
    html: "<p>x</p>",
    propsSchema: {},
  });
  assert.equal(res.ok, true);
  assert.equal(res.artifact.propsSchema, undefined);
});

test("validate: a present-but-non-object propsSchema is rejected", () => {
  const res = validateComponentArtifact({
    name: "X",
    html: "<p>x</p>",
    propsSchema: 42,
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /propsSchema/.test(e)));
});

// ── validateComponentArtifact: rejections ────────────────────────────────────
test("validate: rejects a bad name", () => {
  const res = validateComponentArtifact({ name: "1bad name", html: "<p>x</p>" });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("name must match")));
});

test("validate: empty html gets a read-before-write directive (not an opaque error)", () => {
  // The model sometimes fires update_component with empty html in the same batch as
  // get_component — before the artifact comes back. update REPLACES, so empty html
  // would wipe the component. The error must tell it to get_component first, then
  // re-pass the COMPLETE html, so it self-corrects instead of retrying blind.
  const res = validateComponentArtifact({ name: "Hero", html: "   " });
  assert.equal(res.ok, false);
  const err = res.errors.find((e) => /empty/.test(e));
  assert.ok(err, "names the empty-html cause");
  assert.match(err, /get_component/, "points back to reading first");
  assert.match(err, /REPLACES|erase|wipe/i, "warns the update is destructive");
});

test("validate: missing html is treated as empty (read-before-write)", () => {
  const res = validateComponentArtifact({ name: "Hero" });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /empty/.test(e)));
});

test("validate: any Tailwind class is accepted — no allowlist (renderer compiles per page)", () => {
  // Variants, arbitrary values, raw palette — all valid now; the page renderer
  // compiles the page's actual classes at request time (see tw-compile.ts).
  const res = validateComponentArtifact({
    name: "X",
    html: '<div class="flex p-4 hover:bg-red-500 md:grid-cols-3 h-[37px] bg-[#abc123]"></div>',
  });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

test("validate: arbitrary css root classes are accepted (no allowlist)", () => {
  const res = validateComponentArtifact({
    name: "X",
    html: "<div></div>",
    css: "shadow-2xl ring-4",
  });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

test("validate: rejects an oversized script", () => {
  const res = validateComponentArtifact({
    name: "X",
    html: "<div></div>",
    script: "x".repeat(64 * 1024 + 1),
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("script exceeds")));
});

test("validate: rejects non-object args", () => {
  assert.equal(validateComponentArtifact("nope").ok, false);
  assert.equal(validateComponentArtifact(null).ok, false);
});

test("validate: nested children with arbitrary classes are accepted (no allowlist)", () => {
  const res = validateComponentArtifact({
    name: "X",
    html: '<div class="flex"><span class="bg-[#123] hover:underline"></span></div>',
  });
  assert.equal(res.ok, true, JSON.stringify(res.errors));
});

// ── extractToolCall ──────────────────────────────────────────────────────────
test("extractToolCall: pulls name + arg fragment from a delta", () => {
  const ev = extractToolCall({
    choices: [
      {
        delta: {
          tool_calls: [
            { index: 0, function: { name: "create_component", arguments: '{"na' } },
          ],
        },
      },
    ],
  });
  assert.deepEqual(ev, {
    type: "tool_call",
    index: 0,
    id: undefined,
    name: "create_component",
    argsFragment: '{"na',
  });
});

test("extractToolCall: pulls the provider's call id when present", () => {
  const ev = extractToolCall({
    choices: [{ delta: { tool_calls: [{ index: 0, id: "toolu_123", function: { name: "create_page" } }] } }],
  });
  assert.equal(ev.id, "toolu_123");
});

test("extractToolCall: null when no tool_calls present", () => {
  assert.equal(extractToolCall({ choices: [{ delta: { content: "hi" } }] }), null);
});

test("parseLine: a tool_call SSE line parses to a tool_call event (not a token)", () => {
  const line =
    'data: {"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"x"}}]}}]}';
  assert.deepEqual(parseLine(line), {
    type: "tool_call",
    index: 0,
    id: undefined,
    name: undefined,
    argsFragment: "x",
  });
});

// ── ToolCallAccumulator: reassemble across fragments ─────────────────────────
test("ToolCallAccumulator: reassembles name + streamed args into parsed JSON", () => {
  const acc = new ToolCallAccumulator();
  acc.add({ index: 0, name: "create_component", argsFragment: '{"name":' });
  acc.add({ index: 0, argsFragment: '"Box",' });
  acc.add({ index: 0, argsFragment: '"tree":{"tag":"p"}}' });
  const calls = acc.finish();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "create_component");
  assert.deepEqual(calls[0].args, { name: "Box", tree: { tag: "p" } });
});

test("ToolCallAccumulator: invalid JSON args → args null (never throws)", () => {
  const acc = new ToolCallAccumulator();
  acc.add({ index: 0, name: "create_component", argsFragment: "{not json" });
  assert.equal(acc.finish()[0].args, null);
});

test("ToolCallAccumulator: empty args → {} and size tracks calls", () => {
  const acc = new ToolCallAccumulator();
  assert.equal(acc.size, 0);
  acc.add({ index: 0, name: "create_component" });
  assert.equal(acc.size, 1);
  assert.deepEqual(acc.finish()[0].args, {});
});
