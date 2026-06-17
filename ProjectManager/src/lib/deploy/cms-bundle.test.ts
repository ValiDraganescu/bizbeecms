import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

// Dependency-free: cms-bundle.ts only imports a type from script-upload and
// dynamically imports the @generated artifact. Relative `.ts` import (not `@/`)
// so node's type-stripping resolver finds it.
import {
  buildCmsBundle,
  cmsBundleBuiltAt,
} from "./cms-bundle.ts";
import { buildScriptUploadForm } from "./script-upload.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(__dirname, "cms-bundle.generated.js");
const artifactExists = existsSync(ARTIFACT);

test("buildCmsBundle yields a single self-contained worker module", async (t) => {
  if (!artifactExists) {
    t.skip("cms-bundle.generated.js not built — run scripts/build-cms-bundle.mjs");
    return;
  }
  const bundle = await buildCmsBundle();
  assert.ok(bundle, "expected a bundle when the artifact exists");
  assert.equal(bundle.mainModule, "worker.js");
  assert.equal(typeof bundle.files[bundle.mainModule], "string");
  assert.ok(
    bundle.files[bundle.mainModule].length > 1000,
    "worker source should be substantial",
  );
});

test("cmsBundleBuiltAt returns an ISO timestamp when built", async (t) => {
  if (!artifactExists) {
    t.skip("artifact not built");
    return;
  }
  const builtAt = await cmsBundleBuiltAt();
  assert.ok(builtAt, "expected a builtAt timestamp");
  assert.ok(!Number.isNaN(Date.parse(builtAt)), `not an ISO date: ${builtAt}`);
});

test("the CMS bundle feeds straight into buildScriptUploadForm", async (t) => {
  if (!artifactExists) {
    t.skip("artifact not built");
    return;
  }
  const bundle = await buildCmsBundle();
  assert.ok(bundle);
  // The engine wraps the bundle into a WorkerScriptUpload; confirm the form
  // builder accepts the real bundle and carries the main module part.
  const form = buildScriptUploadForm({
    scriptName: "bizbeecms-cms-demo",
    mainModule: bundle.mainModule,
    files: bundle.files,
  });
  const meta = JSON.parse(await (form.get("metadata") as Blob).text());
  assert.equal(meta.main_module, "worker.js");
  assert.ok(form.get("worker.js") instanceof Blob);
});
