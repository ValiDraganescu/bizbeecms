/**
 * Every tool schema's `type:"array"` node must declare `items` — Gemini's
 * function-calling API rejects the whole request otherwise (INVALID_ARGUMENT
 * "…items: missing field"), which silently made every Gemini model unusable in
 * any chat context that includes create_page / update_page_blocks. Found by
 * scripts/ai-bench. Run: node --test scripts/tool-schema-arrays.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";

const DIR = new URL("../src/lib/chat/", import.meta.url);

test("no tool schema has an array without items", async () => {
  const files = readdirSync(DIR).filter(
    (f) => f.endsWith(".ts") && !f.endsWith(".test.ts") && !f.includes("dispatch") && /tool|schemas|guide/.test(f),
  );
  const bad = [];
  let tools = 0;
  for (const f of files) {
    let mod;
    try {
      mod = await import(new URL(f, DIR));
    } catch {
      continue; // CF-coupled module — not a pure schema file
    }
    for (const v of Object.values(mod)) {
      if (!v || v.type !== "function" || !v.function?.parameters) continue;
      tools += 1;
      const walk = (node, path) => {
        if (!node || typeof node !== "object") return;
        if (node.type === "array" && !node.items) bad.push(`${v.function.name} @ ${path}`);
        for (const [k, child] of Object.entries(node.properties ?? {})) walk(child, `${path}.${k}`);
        if (node.items) walk(node.items, `${path}[]`);
        for (const alt of [...(node.anyOf ?? []), ...(node.oneOf ?? [])]) walk(alt, `${path}|`);
      };
      walk(v.function.parameters, "params");
    }
  }
  assert.ok(tools > 30, `expected to find the tool registry, found ${tools} tools`);
  assert.deepEqual(bad, []);
});
