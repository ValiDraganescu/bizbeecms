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
    "tree",
  ]);
});

// ── validateComponentArtifact: happy path ────────────────────────────────────
test("validate: accepts a valid artifact (tree object + allowed classes)", () => {
  const res = validateComponentArtifact({
    name: "PricingCard",
    tree: {
      tag: "div",
      props: { className: "flex flex-col p-4" },
      children: ["Hello"],
    },
    script: "console.log('hi')",
    css: "block",
  });
  assert.equal(res.ok, true);
  assert.equal(res.artifact.name, "PricingCard");
});

test("validate: accepts tree given as a JSON STRING (open models do this)", () => {
  const res = validateComponentArtifact({
    name: "Box",
    tree: JSON.stringify({ tag: "span", children: ["x"] }),
  });
  assert.equal(res.ok, true);
  assert.equal(res.artifact.script, "");
  assert.equal(res.artifact.css, "");
});

// ── validateComponentArtifact: rejections ────────────────────────────────────
test("validate: rejects a bad name", () => {
  const res = validateComponentArtifact({ name: "1bad name", tree: { tag: "p" } });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("name must match")));
});

test("validate: rejects a non-renderable tree", () => {
  const res = validateComponentArtifact({ name: "X", tree: { notag: true } });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => /tree/.test(e)));
});

test("validate: rejects unknown utility classes in the tree AND lists the accepted ones", () => {
  const res = validateComponentArtifact({
    name: "X",
    tree: { tag: "div", props: { className: "flex made-up-class p-4" } },
  });
  assert.equal(res.ok, false);
  const err = res.errors.find((e) => e.includes("made-up-class"));
  assert.ok(err, "error names the offending class");
  // The error carries the accepted vocabulary so the model can self-correct.
  assert.match(err, /Use ONLY these/);
  assert.match(err, /\bflex\b/, "lists a real accepted class like flex");
});

test("validate: rejects unknown css classes", () => {
  const res = validateComponentArtifact({
    name: "X",
    tree: { tag: "div" },
    css: "not-a-real-class",
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("not-a-real-class")));
});

test("validate: rejects an oversized script", () => {
  const res = validateComponentArtifact({
    name: "X",
    tree: { tag: "div" },
    script: "x".repeat(64 * 1024 + 1),
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("script exceeds")));
});

test("validate: rejects non-object args", () => {
  assert.equal(validateComponentArtifact("nope").ok, false);
  assert.equal(validateComponentArtifact(null).ok, false);
});

test("validate: checks classes in NESTED children, not just the root", () => {
  const res = validateComponentArtifact({
    name: "X",
    tree: {
      tag: "div",
      props: { className: "flex" },
      children: [{ tag: "span", props: { className: "bogus-nested" } }],
    },
  });
  assert.equal(res.ok, false);
  assert.ok(res.errors.some((e) => e.includes("bogus-nested")));
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
