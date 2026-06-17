import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { validateBundleSource, OPENNEXT_DO_CLASSES } from "./bundle-selfcheck.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(__dirname, "..", "src", "lib", "deploy", "cms-bundle.generated.js");

// --- pure validator unit cases (no artifact needed) -------------------------

test("a healthy worker source passes with no errors", () => {
  const src = `export default { async fetch(req){ return new Response("ok"); } };`;
  const { errors } = validateBundleSource("worker.js", src);
  assert.deepEqual(errors, []);
});

test("wrong mainModule is a blocking error", () => {
  const { errors } = validateBundleSource("index.js", "export default {fetch(){}}");
  assert.ok(errors.some((e) => /mainModule/.test(e)));
});

test("missing default export is a blocking error", () => {
  const src = `export const handler = { fetch(){} };`; // no default
  const { errors } = validateBundleSource("worker.js", src);
  assert.ok(errors.some((e) => /default/.test(e)));
});

test("missing fetch handler is a blocking error", () => {
  const src = `export default { scheduled(){} };`;
  const { errors } = validateBundleSource("worker.js", src);
  assert.ok(errors.some((e) => /fetch/.test(e)));
});

test("exported Durable Object classes raise a (non-blocking) warning", () => {
  // mimic OpenNext's export footer
  const src = `export { DOQueueHandler, worker_default as default };\nfetch;`;
  const { errors, warnings } = validateBundleSource("worker.js", src);
  assert.deepEqual(errors, [], "DO gap must be a warning, not a hard error");
  assert.ok(warnings.some((w) => /Durable Object/.test(w)));
  assert.ok(warnings.some((w) => /DOQueueHandler/.test(w)));
});

test("a leftover bare app import is a blocking error; node:/cloudflare: stay external", () => {
  const src =
    `\nimport x from "node:async_hooks";\n` +
    `import y from "cloudflare:workers";\n` +
    `import z from "next/dist/server";\n` + // unresolved bare → error
    `export default { fetch(){} };`;
  const { errors } = validateBundleSource("worker.js", src);
  assert.ok(errors.some((e) => /unresolved external import/.test(e)));
  assert.ok(errors.some((e) => /next\/dist\/server/.test(e)));
});

test("empty source is a blocking error and short-circuits", () => {
  const { errors } = validateBundleSource("worker.js", "");
  assert.equal(errors.length, 1);
  assert.ok(/missing or empty/.test(errors[0]));
});

// --- integration: the REAL committed artifact ------------------------------

test("the committed CMS bundle passes the entry contract (no blocking errors)", async (t) => {
  if (!existsSync(ARTIFACT)) {
    t.skip("cms-bundle.generated.js not built — run npm run bundle:cms");
    return;
  }
  const mod = await import("../src/lib/deploy/cms-bundle.generated.js");
  const src = mod.files?.[mod.mainModule];
  const { errors, warnings } = validateBundleSource(mod.mainModule, src);
  assert.deepEqual(
    errors,
    [],
    `real bundle has blocking issues:\n${errors.join("\n")}`,
  );
  // build-cms-bundle.mjs now STRIPS OpenNext's DO re-exports (the milestone CMS
  // uses dummy caches, so those DOs are dead) so the Script-Upload — which sends
  // no durable_objects/migrations — is no longer rejected by Cloudflare. Guard
  // that the strip stays effective: the committed bundle must export NO DO class.
  assert.ok(
    !warnings.some((w) => OPENNEXT_DO_CLASSES.some((c) => w.includes(c))),
    `committed bundle unexpectedly still exports a Durable Object class — the DO strip in build-cms-bundle.mjs regressed:\n${warnings.join("\n")}`,
  );
});
