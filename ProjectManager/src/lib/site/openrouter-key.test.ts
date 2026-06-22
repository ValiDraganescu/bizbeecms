import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { parseOpenrouterKey } from "./openrouter-key.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

test("EN/FI/ET each carry every new sites.form OpenRouter string", () => {
  const keys = [
    "openrouterKey",
    "openrouterKeyPlaceholder",
    "openrouterKeyClear",
    "openrouterKeySet",
    "openrouterKeyNone",
    "openrouterKeyWillClear",
  ];
  for (const locale of ["en", "fi", "et"]) {
    const m = JSON.parse(
      readFileSync(join(root, "messages", `${locale}.json`), "utf8"),
    );
    for (const k of keys) {
      assert.equal(
        typeof m.sites.form[k],
        "string",
        `${locale}: missing sites.form.${k}`,
      );
      assert.ok(m.sites.form[k].length > 0, `${locale}: empty sites.form.${k}`);
    }
  }
});

// Per-Site OpenRouter key, Slice 2: the write-only update contract.
// Field names are load-bearing for Slice 3 (deploy threading): request body
// uses `openrouterApiKey` (plaintext set/replace) + `clearOpenrouterKey: true`.

test("a plaintext key is trimmed and returned to set", () => {
  const op = parseOpenrouterKey({ openrouterApiKey: "  sk-or-abc  " });
  assert.equal(op.openrouterApiKey, "sk-or-abc");
  assert.equal(op.clearOpenrouterKey, false);
});

test("a blank field is NO CHANGE, not a clear", () => {
  for (const blank of ["", "   ", undefined]) {
    const op = parseOpenrouterKey({ openrouterApiKey: blank });
    assert.equal(op.openrouterApiKey, undefined, `blank ${JSON.stringify(blank)}`);
    assert.equal(op.clearOpenrouterKey, false);
  }
});

test("only clearOpenrouterKey === true arms a clear", () => {
  assert.equal(parseOpenrouterKey({ clearOpenrouterKey: true }).clearOpenrouterKey, true);
  // Truthy-but-not-true values do NOT clear (guards accidental wipes).
  for (const v of ["true", 1, {}, "yes"]) {
    assert.equal(
      parseOpenrouterKey({ clearOpenrouterKey: v }).clearOpenrouterKey,
      false,
      `value ${JSON.stringify(v)}`,
    );
  }
});

test("nothing about the key is set when neither field is present", () => {
  const op = parseOpenrouterKey({});
  assert.equal(op.openrouterApiKey, undefined);
  assert.equal(op.clearOpenrouterKey, false);
});
