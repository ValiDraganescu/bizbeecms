/**
 * llms-template — editable /llms.txt template substitution + validation.
 * Dep-free node --test (project convention).
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  renderLlmsTemplate,
  unknownSlots,
  templateSlots,
  LLMS_TEMPLATE_VARS,
  type LlmsTemplateVars,
} from "./llms-template.ts";

const VARS: LlmsTemplateVars = {
  brandName: "Acme Coffee",
  tagline: "Fresh roasts, daily.",
  origin: "https://acme.example",
  defaultLocale: "en",
  locales: "en, fi, et",
  pageTree: "## Pages\n- [About](https://acme.example/about.md)",
};

test("substitutes known slots (shared {{slot}} syntax, incl. `t ` prefix + whitespace)", () => {
  const out = renderLlmsTemplate(
    "# {{ brandName }}\n\n> {{tagline}}\n\n{{ t pageTree }}",
    VARS,
  );
  assert.equal(
    out,
    "# Acme Coffee\n\n> Fresh roasts, daily.\n\n" +
      "## Pages\n- [About](https://acme.example/about.md)\n",
  );
});

test("every documented var is a real, substitutable slot", () => {
  for (const v of LLMS_TEMPLATE_VARS) {
    const out = renderLlmsTemplate(`{{${v.slot}}}`, VARS);
    assert.equal(out, VARS[v.slot] + "\n");
  }
});

test("unknownSlots names bad tokens (sorted, distinct); known-only = valid", () => {
  assert.deepEqual(unknownSlots("{{brandName}} {{pageTree}}"), []);
  assert.deepEqual(
    unknownSlots("{{brandnaem}} {{foo}} {{brandName}} {{foo}}"),
    ["brandnaem", "foo"],
  );
});

test("blank template is valid (route falls back to auto output)", () => {
  assert.deepEqual(unknownSlots(""), []);
});

test("templateSlots is first-seen order, distinct", () => {
  assert.deepEqual(
    templateSlots("{{origin}} {{brandName}} {{origin}}"),
    ["origin", "brandName"],
  );
});

test("unknown slot at render substitutes to '' (never leaks the literal)", () => {
  assert.equal(renderLlmsTemplate("a{{nope}}b", VARS), "ab\n");
});

test("always exactly one trailing newline", () => {
  assert.equal(renderLlmsTemplate("x", VARS), "x\n");
  assert.equal(renderLlmsTemplate("x\n", VARS), "x\n");
  assert.equal(renderLlmsTemplate("x\n\n", VARS), "x\n\n");
});
