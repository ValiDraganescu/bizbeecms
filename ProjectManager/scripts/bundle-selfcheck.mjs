#!/usr/bin/env node
// CMS bundle boot self-check — STATIC validation of the committed CMS Worker
// artifact (`src/lib/deploy/cms-bundle.generated.js`) beyond the size check the
// preflight already does. This is the one link in the deploy chain that no other
// offline check covers: does the esbuild'd OpenNext worker have the SHAPE a
// Cloudflare Workers Script-Upload needs, and does our upload metadata declare
// everything the worker exports?
//
// It can't actually BOOT the worker (that needs a Worker runtime + CF auth this
// env lacks), so it does the next best thing: parse the worker source for the
// structural contract a real upload depends on.
//
// What it checks (pure, exported `validateBundleSource` → {errors, warnings}):
//   1. ENTRY CONTRACT (error): the source has a `default` export and a `fetch`
//      handler — without these the uploaded Worker has no request entry point.
//   2. DURABLE OBJECT GAP (warning): OpenNext's worker exports DO classes
//      (DOQueueHandler / DOShardedTagCache / BucketCachePurge) for its
//      incremental-cache / tag-cache / queue. The Script-Upload metadata we build
//      (`buildScriptUploadForm`) declares NO `durable_objects` bindings or
//      `migrations`, so a live upload of this bundle would be rejected (or boot
//      with the DOs unbound). This is the documented esbuild-vs-wrangler gap
//      (CAVEATS "CMS bundle production"; DEPLOY.md step 11 ⚠️). Surfaced loudly so
//      the live-deploy step handles it (declare DO migrations in the upload
//      metadata, or strip OpenNext's DO cache for the milestone).
//   3. UNRESOLVED BARE IMPORTS (error): a self-contained bundle must not still
//      `import ... from "<bare app/npm specifier>"` — only node:/cloudflare:
//      builtins are allowed external. A leftover bare import = a broken esbuild
//      bundle that will fail to instantiate on the Worker.
//   4. STATIC-ASSETS GAP (warning): OpenNext's worker serves `_next/static/*`,
//      CSS, client JS chunks and public/ files by delegating to the Workers
//      Static-Assets binding (`env.ASSETS.fetch(...)`). The committed artifact
//      ships ONLY the worker JS module and `buildScriptUploadForm` sends no
//      `assets` metadata + no ASSETS binding, so a live `PUT workers/scripts`
//      upload would boot a worker whose `env.ASSETS` is undefined → every static
//      asset 404s (unstyled, non-interactive pages). Surfaced loudly so the
//      live-deploy step handles it (upload the assets via Cloudflare's Workers
//      Assets API + reference the completion token in the script-upload metadata,
//      or otherwise make ASSETS resolvable). See DEPLOY.md / CAVEATS "static
//      assets gap".
//
// Run: `npm run bundle:selfcheck` (from ProjectManager/). Pure read-only.
// Also imported by preflight so `npm run preflight` runs it automatically.

import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Durable Object classes OpenNext's worker exports. If the worker exports any of
// these, the upload metadata must declare matching durable_objects + migrations.
export const OPENNEXT_DO_CLASSES = [
  "DOQueueHandler",
  "DOShardedTagCache",
  "BucketCachePurge",
];

// Allowed external module prefixes in a self-contained Worker bundle. Everything
// else MUST be bundled in; a leftover bare import means the bundle is incomplete.
const ALLOWED_EXTERNAL_PREFIXES = ["node:", "cloudflare:"];

// Pure: validate the worker source text + mainModule → {errors, warnings}.
// `mainModule` is the artifact's declared entry file name.
export function validateBundleSource(mainModule, source) {
  const errors = [];
  const warnings = [];

  if (mainModule !== "worker.js") {
    errors.push(`bundle: mainModule is "${mainModule}", expected "worker.js".`);
  }
  if (typeof source !== "string" || source.length === 0) {
    errors.push(`bundle: worker source is missing or empty — re-run \`npm run bundle:cms\`.`);
    return { errors, warnings }; // nothing more to inspect
  }

  // 1. Entry contract: a default export + a fetch handler.
  const hasDefaultExport =
    /\bexport\s+default\b/.test(source) ||
    /\bexport\s*\{[^}]*\bdefault\b[^}]*\}/.test(source) || // `export { x as default }`
    /\bas\s+default\b/.test(source);
  if (!hasDefaultExport) {
    errors.push(
      `bundle: no \`default\` export found — the uploaded Worker would have no entry module.`,
    );
  }
  if (!/\bfetch\b/.test(source)) {
    errors.push(
      `bundle: no \`fetch\` handler reference found — the Worker can't serve requests.`,
    );
  }

  // 2. Durable Object gap: exported DO classes with no binding/migration in the
  //    upload metadata. Detect via the export footer (`export { ... DOX ... }`).
  const exportedDOs = OPENNEXT_DO_CLASSES.filter((cls) =>
    new RegExp(`\\bas\\s+${cls}\\b|\\b${cls}\\s*[,}]|\\bexport\\s+(?:class|const|function)\\s+${cls}\\b`).test(
      source,
    ),
  );
  if (exportedDOs.length) {
    warnings.push(
      `bundle: worker exports Durable Object class(es) [${exportedDOs.join(", ")}] but the ` +
        `Script-Upload metadata declares no durable_objects/migrations. A LIVE upload of this ` +
        `bundle will be rejected (or boot with DOs unbound). Resolve at the live-deploy step: ` +
        `declare DO migrations in buildScriptUploadForm's metadata, or disable OpenNext's DO ` +
        `cache for the milestone. See CAVEATS "CMS bundle production" / DEPLOY.md step 11.`,
    );
  }

  // 3. Unresolved bare imports. Only REAL top-level import declarations count —
  //    esbuild emits those at column 0 (`\nimport … from "<spec>"`). We anchor on
  //    that to skip the many `from "x"` fragments that appear INSIDE string
  //    literals / error messages within the bundled source (those are always
  //    indented). A real external that isn't node:/cloudflare: = incomplete bundle.
  const bareImports = new Set();
  const importRe = /\nimport\b[^;\n]*?from\s*["']([^"']+)["']/g;
  const bareSideEffectRe = /\nimport\s*["']([^"']+)["']/g; // `import "x";`
  for (const re of [importRe, bareSideEffectRe]) {
    let m;
    while ((m = re.exec(source)) !== null) {
      const spec = m[1];
      const isAllowed = ALLOWED_EXTERNAL_PREFIXES.some((p) => spec.startsWith(p));
      if (!isAllowed) bareImports.add(spec);
    }
  }
  if (bareImports.size) {
    const list = [...bareImports].slice(0, 8).join(", ");
    errors.push(
      `bundle: ${bareImports.size} unresolved external import(s) remain in the bundled worker ` +
        `(e.g. ${list}) — only node:/cloudflare: builtins may stay external. The esbuild bundle ` +
        `is incomplete; re-run \`npm run bundle:cms\`.`,
    );
  }

  // 4. Static-assets gap: the worker delegates static-file requests to the
  //    Workers Static-Assets binding (`env.ASSETS.fetch(...)`). Our upload ships
  //    only the JS module and declares no `assets`/ASSETS binding, so a live
  //    upload boots a worker with `env.ASSETS` undefined → static assets 404.
  //    Match the `env.ASSETS.fetch(` call (not just any `ASSETS` mention) so a
  //    stray string literal can't trip it.
  if (/\benv\.ASSETS\.fetch\b/.test(source)) {
    warnings.push(
      `bundle: worker serves static files via the Workers Static-Assets binding ` +
        `(env.ASSETS.fetch) but the Script-Upload sends no \`assets\` metadata/ASSETS binding ` +
        `and the committed artifact ships only the JS module. A LIVE upload of this bundle ` +
        `would boot with env.ASSETS undefined → _next/static, CSS and client JS chunks all 404 ` +
        `(unstyled, non-interactive pages). Resolve at the live-deploy step: upload the ` +
        `.open-next/assets via Cloudflare's Workers Assets API and reference the completion ` +
        `token in buildScriptUploadForm's metadata. See CAVEATS "static assets gap" / DEPLOY.md.`,
    );
  }

  return { errors, warnings };
}

// Only run the live check when executed directly, not when imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

async function main() {
  const errors = [];
  const warnings = [];
  try {
    const mod = await import("../src/lib/deploy/cms-bundle.generated.js");
    const src = mod.files?.[mod.mainModule];
    const r = validateBundleSource(mod.mainModule, src);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  } catch (e) {
    errors.push(
      `cms-bundle.generated.js missing or invalid (${e.message}). ` +
        `Generate it with \`npm run bundle:cms\`.`,
    );
  }

  for (const w of warnings) console.warn(`⚠️  ${w}`);
  if (errors.length) {
    console.error(`\n❌ Bundle self-check FAILED — ${errors.length} blocking issue(s):`);
    for (const e of errors) console.error(`   • ${e}`);
    process.exit(1);
  }
  console.log(
    `✅ Bundle self-check passed${warnings.length ? ` (${warnings.length} warning(s) above)` : ""}.`,
  );
}
