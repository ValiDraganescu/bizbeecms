#!/usr/bin/env node
// Pre-deploy validation for the ProjectManager Worker.
// Fails LOUDLY (exit 1) on the known first-deploy footguns so a botched
// `wrangler deploy` is caught before it ships:
//   - wrangler.jsonc still has placeholder zero-ids for D1 / KV
//   - required OpenNext compat flags are missing
//   - the committed CMS deploy bundle is missing / empty / wrong-shaped
//
// Run: `npm run preflight` (from ProjectManager/). Pure read-only checks —
// no Cloudflare auth needed, so it runs in any env. Exit 0 = ready to deploy.
//
// ponytail: string/regex checks over the config + a require() of the bundle
// artifact. No JSONC parser dep — strip comments + JSON.parse. Upgrade to a
// real jsonc lib only if the config grows tricky (it won't).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { validateBundleSource } from "./bundle-selfcheck.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const REQUIRED_COMPAT_FLAGS = ["nodejs_compat", "global_fetch_strictly_public"];
const PLACEHOLDER_RE = /^[0-]+$/; // all zeros and dashes = the seeded placeholder

// Strip // line and /* */ block comments so JSON.parse can read wrangler.jsonc.
// Naive but adequate here: the config has no // or /* inside string values.
// ponytail: naive comment strip; switch to a jsonc parser if a URL/glob with
// "//" ever lands in a string value.
export function parseJsonc(text) {
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, "");
  const noLine = noBlock.replace(/^\s*\/\/.*$/gm, "");
  return JSON.parse(noLine);
}

// Pure: validate a parsed wrangler config object → {errors, warnings}.
// Bundle checks live separately (they touch the filesystem). Exported for tests.
export function validateWranglerConfig(cfg) {
  const errors = [];
  const warnings = [];
  const flags = cfg.compatibility_flags ?? [];
  for (const f of REQUIRED_COMPAT_FLAGS) {
    if (!flags.includes(f)) {
      errors.push(`wrangler.jsonc: missing required compatibility flag "${f}" (OpenNext needs it).`);
    }
  }
  for (const d1 of cfg.d1_databases ?? []) {
    if (!d1.database_id || PLACEHOLDER_RE.test(d1.database_id)) {
      errors.push(
        `wrangler.jsonc: D1 "${d1.binding}" database_id is a placeholder (${d1.database_id}). ` +
          `Run \`wrangler d1 create ${d1.database_name}\` and paste the real id.`
      );
    }
  }
  for (const kv of cfg.kv_namespaces ?? []) {
    if (!kv.id || PLACEHOLDER_RE.test(kv.id)) {
      errors.push(
        `wrangler.jsonc: KV "${kv.binding}" id is a placeholder (${kv.id}). ` +
          `Run \`wrangler kv namespace create ${kv.binding}\` and paste the real id.`
      );
    }
  }
  if (!cfg.vars?.APP_ORIGIN) {
    warnings.push(
      `wrangler.jsonc: vars.APP_ORIGIN is unset — invite/email links will not generate in production ` +
        `(Host-Header injection guard). Set it to the deployed PM origin if you need invites.`
    );
  }
  return { errors, warnings };
}

// Only run the live checks when executed directly, not when imported by a test.
if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

async function main() {
const errors = [];
const warnings = [];

// --- 1. wrangler.jsonc -------------------------------------------------------
let cfg;
try {
  cfg = parseJsonc(readFileSync(resolve(ROOT, "wrangler.jsonc"), "utf8"));
} catch (e) {
  errors.push(`wrangler.jsonc unreadable/unparseable: ${e.message}`);
}

if (cfg) {
  const r = validateWranglerConfig(cfg);
  errors.push(...r.errors);
  warnings.push(...r.warnings);
}

// --- 2. CMS deploy bundle artifact ------------------------------------------
try {
  const mod = await import("../src/lib/deploy/cms-bundle.generated.js");
  if (mod.mainModule !== "worker.js") {
    errors.push(`cms-bundle.generated.js: mainModule is "${mod.mainModule}", expected "worker.js".`);
  }
  const src = mod.files?.["worker.js"];
  if (typeof src !== "string" || src.length === 0) {
    errors.push(`cms-bundle.generated.js: files["worker.js"] is missing or empty — re-run \`npm run bundle:cms\`.`);
  } else if (src.length < 100_000) {
    // a real OpenNext worker bundle is multi-MB; <100KB means a broken/partial build
    errors.push(
      `cms-bundle.generated.js: worker.js source is only ${src.length} bytes — looks broken/partial. ` +
        `Re-run \`npm run bundle:cms\`.`
    );
  } else {
    // Structural boot self-check: entry contract, DO-binding gap, leftover bare
    // imports. The one link no other offline check covers.
    const r = validateBundleSource(mod.mainModule, src);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  }
  if (!mod.builtAt) warnings.push(`cms-bundle.generated.js: no builtAt timestamp.`);
} catch (e) {
  errors.push(
    `cms-bundle.generated.js missing or invalid (${e.message}). ` +
      `Generate the CMS deploy bundle with \`npm run bundle:cms\`.`
  );
}

// --- report ------------------------------------------------------------------
for (const w of warnings) console.warn(`⚠️  ${w}`);
if (errors.length) {
  console.error(`\n❌ Preflight FAILED — ${errors.length} blocking issue(s):`);
  for (const e of errors) console.error(`   • ${e}`);
  console.error(`\nFix the above before deploying. See DEPLOY runbook / CAVEATS.`);
  process.exit(1);
}
console.log(`✅ Preflight passed${warnings.length ? ` (${warnings.length} warning(s) above)` : ""} — ready to deploy.`);
}
