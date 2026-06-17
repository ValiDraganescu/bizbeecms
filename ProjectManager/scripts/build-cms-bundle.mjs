#!/usr/bin/env node
/**
 * build-cms-bundle — produce the committed CMS Worker artifact that the
 * Site-deploy engine (`@/lib/deploy`) uploads to Cloudflare per Site.
 *
 * WHY a committed artifact (not build-on-demand):
 * The milestone requires deploy to work *from the deployed PM*, which runs on
 * Cloudflare Workers and CANNOT shell out to a build (no Node, no esbuild, no
 * filesystem to read `CMS/.open-next/`). So the CMS Worker must be pre-bundled
 * at PM build time into a single self-contained ESM module and committed, so the
 * deployed PM can simply `import` it and hand it to `deploySite`.
 *
 * WHY esbuild (one module, not 980 files):
 * OpenNext emits `CMS/.open-next/worker.js` + ~980 relative chunk modules
 * (16MB). `wrangler deploy` normally esbuild-bundles those into one worker before
 * upload. We do the same here so the artifact is a single ~4MB self-contained
 * module — small enough to commit and trivial for the Script-Upload API
 * (`{ mainModule:'worker.js', files:{ 'worker.js': <source> } }`).
 *
 * Pipeline:
 *   1. (optionally) run `opennextjs-cloudflare build` in CMS/ to refresh output.
 *   2. esbuild-bundle CMS/.open-next/worker.js → one ESM string.
 *   3. write src/lib/deploy/cms-bundle.generated.js exporting { mainModule, files, builtAt }.
 *
 * Usage (from ProjectManager/):
 *   node scripts/build-cms-bundle.mjs            # bundle existing CMS/.open-next
 *   node scripts/build-cms-bundle.mjs --opennext # also run OpenNext over CMS/ first
 *
 * Node builtins used by the CMS worker (async_hooks, buffer, crypto, ...) are
 * left external and resolved at runtime by the `nodejs_compat` flag; the deploy
 * engine sets DEFAULT_COMPAT_FLAGS = ['nodejs_compat','global_fetch_strictly_public'].
 */

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PM_ROOT = resolve(__dirname, "..");
const REPO_ROOT = resolve(PM_ROOT, "..");
const CMS_ROOT = join(REPO_ROOT, "CMS");
const CMS_OPEN_NEXT = join(CMS_ROOT, ".open-next");
const CMS_WORKER_ENTRY = join(CMS_OPEN_NEXT, "worker.js");
const OUT_FILE = join(PM_ROOT, "src", "lib", "deploy", "cms-bundle.generated.js");

const MAIN_MODULE = "worker.js";

function log(...args) {
  console.log("[build-cms-bundle]", ...args);
}

function runOpenNext() {
  log("Running OpenNext build over CMS/ …");
  execFileSync("npx", ["opennextjs-cloudflare", "build"], {
    cwd: CMS_ROOT,
    stdio: "inherit",
  });
}

// OpenNext's worker entry ALWAYS re-exports three Durable Object classes
// (DOQueueHandler / DOShardedTagCache / BucketCachePurge), regardless of the
// cache config — they back the incremental-cache / tag-cache / queue overrides.
// The milestone CMS uses dummy (no-op) caches (CMS/open-next.config.ts), so these
// DOs are never instantiated at runtime. But the PM Script-Upload path
// (src/lib/deploy/script-upload.ts) sends NO durable_objects/migrations metadata,
// and Cloudflare REJECTS a Worker that exports DO classes without matching
// migrations. So we strip these dead re-exports from the entry before bundling.
// Matches both `export { X } from "..."` and `export { X as Y } from "..."`.
const DO_EXPORT_RE =
  /^[ \t]*export\s*\{\s*(?:DOQueueHandler|DOShardedTagCache|BucketCachePurge)\b[^}]*\}\s*from\s*["'][^"']*["'];?[ \t]*$/gm;

function stripDoExports(src) {
  const out = src.replace(DO_EXPORT_RE, "");
  // ponytail: assert the strip worked — a future OpenNext rename would silently
  // re-introduce the DO exports and break the live upload again.
  if (/\bexport\s*\{[^}]*\b(?:DOQueueHandler|DOShardedTagCache|BucketCachePurge)\b/.test(out)) {
    throw new Error(
      "stripDoExports: a Durable Object re-export survived — OpenNext entry shape changed; update DO_EXPORT_RE.",
    );
  }
  return out;
}

async function bundleWorker() {
  if (!existsSync(CMS_WORKER_ENTRY)) {
    throw new Error(
      `CMS worker not found at ${CMS_WORKER_ENTRY}.\n` +
        `Run with --opennext, or build CMS first: (cd ${CMS_ROOT} && npx opennextjs-cloudflare build)`,
    );
  }

  const entrySource = stripDoExports(readFileSync(CMS_WORKER_ENTRY, "utf8"));

  log("esbuild-bundling", CMS_WORKER_ENTRY, "(DO re-exports stripped)");
  const result = await esbuild({
    // Feed the DO-stripped entry via stdin; resolveDir keeps the worker's
    // ~980 relative chunk imports resolving against CMS/.open-next/.
    stdin: {
      contents: entrySource,
      resolveDir: CMS_OPEN_NEXT,
      sourcefile: "worker.js",
      loader: "js",
    },
    bundle: true,
    format: "esm",
    platform: "node",
    target: "es2022",
    // Node builtins + Cloudflare runtime modules are provided by the Worker
    // runtime (nodejs_compat); don't try to bundle them.
    external: ["node:*", "cloudflare:*"],
    write: false,
    legalComments: "none",
    logLevel: "warning",
  });

  const out = result.outputFiles?.[0];
  if (!out) throw new Error("esbuild produced no output");
  return out.text;
}

function emitArtifact(source) {
  const builtAt = new Date().toISOString();
  const sizeKb = Math.round(Buffer.byteLength(source, "utf8") / 1024);

  // Embed the bundled worker source as a string literal. JSON.stringify yields a
  // valid, safely-escaped JS string literal for arbitrary source text.
  const literal = JSON.stringify(source);

  const banner =
    "// @generated by scripts/build-cms-bundle.mjs — DO NOT EDIT BY HAND.\n" +
    "// The single-module CMS Worker bundle uploaded per-Site by @/lib/deploy.\n" +
    "// Regenerate with: node scripts/build-cms-bundle.mjs [--opennext]\n";

  const body =
    banner +
    `export const builtAt = ${JSON.stringify(builtAt)};\n` +
    `export const mainModule = ${JSON.stringify(MAIN_MODULE)};\n` +
    `const workerSource = ${literal};\n` +
    `export const files = { [mainModule]: workerSource };\n`;

  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, body, "utf8");
  log(`Wrote ${OUT_FILE} (${sizeKb} KB worker source, builtAt=${builtAt})`);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--opennext")) runOpenNext();

  const source = await bundleWorker();
  emitArtifact(source);
  log("Done.");
}

main().catch((err) => {
  console.error("[build-cms-bundle] FAILED:", err.message);
  process.exit(1);
});
