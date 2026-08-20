#!/usr/bin/env node
/**
 * connect — choose what the LOCAL dev servers (PM :3601, CMS :3602) talk to.
 *
 *   CMS targets (one at a time):
 *     node scripts/connect.mjs cms <slug>            # LOCAL Site from the local PM (own D1/R2 under CMS/.wrangler/sites/<slug>/)
 *     node scripts/connect.mjs cms local <slug>      # same, explicit
 *     node scripts/connect.mjs cms prod <slug>       # PRODUCTION Site: its real D1/R2 via wrangler remote bindings (+ real PM)
 *   PM targets:
 *     node scripts/connect.mjs pm prod               # local PM -> prod D1 + KV
 *     node scripts/connect.mjs pm local              # back to local Miniflare
 *   Misc:
 *     node scripts/connect.mjs local [cms|pm]        # leave prod-remote mode (CMS falls back to its active local Site)
 *     node scripts/connect.mjs status
 *     node scripts/connect.mjs sites [local|prod]    # Site slugs known to the local / prod PM (default both)
 *
 * LOCAL Site: writes CMS/.local-site.json ({slug,id,persist}) and patches
 * SITE_ID in CMS/.dev.vars; next.config.ts boots Miniflare with that persist
 * dir (migrated on first use). Content never bleeds between local Sites.
 *
 * PROD: the committed wrangler.jsonc is NEVER touched. We generate a gitignored
 * `wrangler.prod-remote.jsonc` (same config, bindings moved under
 * `env.prod-remote` with `remote: true` + real ids) and drop a
 * `.prod-remote.json` marker. next.config.ts sees the marker (it wins over the
 * local-site marker) and boots initOpenNextCloudflareForDev with that config +
 * environment. Secrets for the env live in the gitignored `.dev.vars.prod-remote`.
 *
 * Restart `npm run dev` after any switch — everything is read at boot.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PM_DIR = join(ROOT, "ProjectManager");
const CMS_DIR = join(ROOT, "CMS");
const ENV_NAME = "prod-remote";
const GEN = "wrangler.prod-remote.jsonc";
const MARKER = ".prod-remote.json";
const SECRETS = `.dev.vars.${ENV_NAME}`;
const LOCAL_MARKER = ".local-site.json";
const DEV_VARS = ".dev.vars";
const SITES_DIR = ".wrangler/sites"; // relative to CMS_DIR (cwd of `next dev`)
const LEGACY_STATE = ".wrangler/state"; // wrangler's default persist dir (pre-switcher data)
const CMS_DB_NAME = "bizbeecms-cms";
const PM_ORIGIN = "https://manager.bizbeecms.com";
const PM_DB_NAME = "bizbeecms";
// Must match deployer/src/index.ts naming (DB_NAME / BUCKET_NAME).
const cmsDbName = (slug) => `bizbeecms-cms-${slug}`;
const cmsBucketName = (slug) => `bizbeecms-cms-media-${slug}`;

const [, , cmd, arg, arg2] = process.argv;

// ---------------------------------------------------------------- helpers ---
function die(msg) { console.error(`✗ ${msg}`); process.exit(1); }
function ok(msg) { console.log(`✓ ${msg}`); }

/** Strip // and /* *​/ comments from JSONC (string-aware) and parse. */
function parseJsonc(text) {
  let out = "", i = 0, inStr = false;
  while (i < text.length) {
    const c = text[i], n = text[i + 1];
    if (inStr) { out += c; if (c === "\\") { out += n; i += 2; continue; } if (c === '"') inStr = false; i++; continue; }
    if (c === '"') { inStr = true; out += c; i++; continue; }
    if (c === "/" && n === "/") { while (i < text.length && text[i] !== "\n") i++; continue; }
    if (c === "/" && n === "*") { i += 2; while (i < text.length && !(text[i] === "*" && text[i + 1] === "/")) i++; i += 2; continue; }
    out += c; i++;
  }
  // tolerate trailing commas
  return JSON.parse(out.replace(/,(\s*[}\]])/g, "$1"));
}

function wrangler(cwd, args, { json = false } = {}) {
  const out = execFileSync("npx", ["wrangler", ...args], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return json ? JSON.parse(out) : out;
}

/** Bindings are NOT inherited into wrangler environments — move them under env. */
const BINDING_KEYS = ["vars", "d1_databases", "kv_namespaces", "r2_buckets", "images", "send_email", "unsafe", "services", "queues", "ai", "browser", "vectorize", "hyperdrive"];

function buildConfig(base, { vars, d1, kv, r2 }) {
  const top = { ...base };
  const env = {};
  for (const k of BINDING_KEYS) if (k in top) { env[k] = top[k]; delete top[k]; }
  delete top.routes; // never bind local dev to prod routes
  env.vars = { ...(env.vars ?? {}), ...vars };
  if (env.d1_databases) env.d1_databases = env.d1_databases.map((d) => ({ ...d, ...(d1?.[d.binding] ?? {}), remote: true }));
  if (env.kv_namespaces) env.kv_namespaces = env.kv_namespaces.map((k) => ({ ...k, ...(kv?.[k.binding] ?? {}), remote: true }));
  if (env.r2_buckets) env.r2_buckets = env.r2_buckets.map((b) => ({ ...b, ...(r2?.[b.binding] ?? {}), remote: true }));
  if (env.images) env.images = { ...env.images, remote: true };
  // send_email stays LOCAL (logged, not sent) — remote would email real people.
  return { ...top, env: { [ENV_NAME]: env } };
}

function writeGenerated(dir, cfg, marker) {
  const banner = `// GENERATED by scripts/connect.mjs — gitignored, do not edit.\n// Points local \`next dev\` at PRODUCTION resources (remote bindings). Run\n// \`scripts/connect.mjs local\` to remove.\n`;
  writeFileSync(join(dir, GEN), banner + JSON.stringify(cfg, null, 2) + "\n");
  writeFileSync(join(dir, MARKER), JSON.stringify({ ...marker, env: ENV_NAME, config: GEN, at: new Date().toISOString() }, null, 2) + "\n");
}

function ensureSecrets(dir, template) {
  const p = join(dir, SECRETS);
  if (existsSync(p)) return false;
  writeFileSync(p, template);
  return true;
}

function disconnect(dir, label) {
  let did = false;
  for (const f of [GEN, MARKER]) { const p = join(dir, f); if (existsSync(p)) { unlinkSync(p); did = true; } }
  console.log(did ? `✓ ${label}: restored LOCAL (removed ${GEN}, ${MARKER})` : `· ${label}: already local`);
}

function status(dir, label) {
  const p = join(dir, MARKER);
  if (!existsSync(p)) { console.log(`· ${label}: LOCAL`); if (dir === CMS_DIR) statusLocal(); return; }
  const m = JSON.parse(readFileSync(p, "utf8"));
  console.log(`● ${label}: PROD-REMOTE ${m.slug ? `site=${m.slug} (${m.siteId})` : ""} since ${m.at}`);
}

// ------------------------------------------------------ local Site switching ---
function localSites() {
  const out = wrangler(PM_DIR, ["d1", "execute", PM_DB_NAME, "--local", "--json", "--command", "select id, slug, name from sites order by slug"]);
  return JSON.parse(out)[0]?.results ?? [];
}

function readLocalMarker() {
  const p = join(CMS_DIR, LOCAL_MARKER);
  return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : null;
}

function currentSiteId() {
  const p = join(CMS_DIR, DEV_VARS);
  if (!existsSync(p)) return "";
  return readFileSync(p, "utf8").match(/^SITE_ID=(.*)$/m)?.[1]?.trim() ?? "";
}

function patchSiteId(id) {
  const p = join(CMS_DIR, DEV_VARS);
  if (!existsSync(p)) die(`${p} missing — create it first (see CMS/README.md)`);
  const text = readFileSync(p, "utf8");
  const next = /^SITE_ID=.*$/m.test(text) ? text.replace(/^SITE_ID=.*$/m, `SITE_ID=${id}`) : `${text.trimEnd()}\nSITE_ID=${id}\n`;
  writeFileSync(p, next);
}

function connectCmsLocal(slug) {
  if (!slug) die("usage: connect cms <slug>");
  const site = localSites().find((s) => s.slug === slug);
  if (!site) die(`no local PM Site with slug "${slug}" — create it in the local PM first (run \`list\` to see slugs)`);

  const siteDir = join(CMS_DIR, SITES_DIR, slug);
  const legacy = join(CMS_DIR, LEGACY_STATE);
  if (!existsSync(siteDir)) {
    mkdirSync(join(CMS_DIR, SITES_DIR), { recursive: true });
    // One-time adoption: the pre-switcher default state belongs to whichever Site
    // .dev.vars currently points at — keep that data instead of orphaning it.
    if (existsSync(legacy) && !readLocalMarker() && currentSiteId() === site.id) {
      renameSync(legacy, siteDir);
      ok(`adopted existing ${LEGACY_STATE} as ${SITES_DIR}/${slug}`);
    } else {
      mkdirSync(siteDir, { recursive: true });
      ok(`created fresh state dir ${SITES_DIR}/${slug}`);
    }
  }

  // Always apply migrations — idempotent, and a fresh dir needs the schema.
  wrangler(CMS_DIR, ["d1", "migrations", "apply", CMS_DB_NAME, "--local", "--persist-to", `${SITES_DIR}/${slug}`]);
  ok(`D1 migrations applied (${SITES_DIR}/${slug})`);

  writeFileSync(join(CMS_DIR, LOCAL_MARKER), JSON.stringify({ slug, id: site.id, persist: `${SITES_DIR}/${slug}/v3` }, null, 2) + "\n");
  patchSiteId(site.id);
  ok(`CMS -> ${site.name} (${slug}, ${site.id})`);
  console.log("→ Restart the CMS dev server:  cd CMS && npm run dev");
}

function listLocal() {
  const m = readLocalMarker();
  for (const s of localSites()) {
    const has = existsSync(join(CMS_DIR, SITES_DIR, s.slug));
    console.log(`${m?.slug === s.slug ? "*" : " "} ${s.slug.padEnd(24)} ${s.name.padEnd(28)} ${s.id}${has ? "" : "  (no local state yet)"}`);
  }
}

function statusLocal() {
  const m = readLocalMarker();
  if (!m) { console.log(`· no ${LOCAL_MARKER}: CMS uses wrangler default state (${LEGACY_STATE}), SITE_ID=${currentSiteId() || "(unset)"}`); return; }
  console.log(`· CMS local Site: ${m.slug} (${m.id}) persist=${m.persist}${currentSiteId() === m.id ? "" : `  ⚠ .dev.vars SITE_ID=${currentSiteId()} MISMATCH`}`);
}

// --------------------------------------------------------------- commands ---
function connectCmsProd(slug) {
  if (!slug) die("usage: connect cms prod <site-slug>");
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) die(`bad slug "${slug}"`);

  // Site id from the PROD PM D1 (read-only query).
  const rows = wrangler(PM_DIR, ["d1", "execute", PM_DB_NAME, "--remote", "--json", "--command",
    `select id, name, status, worker_name from sites where slug='${slug}'`], { json: true });
  const site = rows?.[0]?.results?.[0];
  if (!site) die(`no Site with slug "${slug}" in prod PM DB. Known: ${prodSlugs().join(", ")}`);
  ok(`site ${slug} → id ${site.id} (${site.name}, ${site.status})`);

  const dbName = cmsDbName(slug);
  let dbId;
  try { dbId = wrangler(CMS_DIR, ["d1", "info", dbName, "--json"], { json: true }).uuid; } catch { /* fallthrough */ }
  if (!dbId) die(`D1 "${dbName}" not found — has this Site been deployed at least once?`);
  ok(`D1 ${dbName} → ${dbId}`);

  const bucket = cmsBucketName(slug);
  const buckets = wrangler(CMS_DIR, ["r2", "bucket", "list"]);
  if (!buckets.includes(bucket)) console.warn(`! R2 bucket ${bucket} not found — media will 404`);
  else ok(`R2 ${bucket}`);

  const base = parseJsonc(readFileSync(join(CMS_DIR, "wrangler.jsonc"), "utf8"));
  const cfg = buildConfig(base, {
    vars: { SITE_ID: site.id, PM_ORIGIN, APP_ORIGIN: "http://localhost:3602" },
    d1: { DB: { database_name: dbName, database_id: dbId } },
    r2: { MEDIA: { bucket_name: bucket } },
  });
  writeGenerated(CMS_DIR, cfg, { slug, siteId: site.id, dbId, bucket });
  const created = ensureSecrets(CMS_DIR, `# Secrets for prod-remote mode (gitignored). Loaded INSTEAD of .dev.vars when
# scripts/connect.mjs cms prod <slug> is active. Do NOT put SITE_ID/PM_ORIGIN/
# APP_ORIGIN here — the generated wrangler.prod-remote.jsonc sets those.
#
# PM<->CMS shared bearer — the PRODUCTION value (same as the deployer's
# CMS_AUTH_SECRET). Empty => PM service calls (cms-validate/ai-config) 401;
# CMS_DEV_SUPERADMIN=1 in .env.local still lets you into the admin UI.
CMS_AUTH_SECRET=
# OpenRouter key for AI features while connected (your own dev key is fine).
OPENROUTER_API_KEY=
`);
  console.log(`\n✓ CMS → PROD site "${slug}". Wrote CMS/${GEN} + CMS/${MARKER}.`);
  if (created) console.log(`! Created CMS/${SECRETS} — fill CMS_AUTH_SECRET / OPENROUTER_API_KEY if you need PM calls / AI.`);
  console.log(`→ Restart the CMS dev server:  cd CMS && npm run dev\n  ⚠ Every write now hits the REAL Site database/bucket.`);
}

function prodSlugs() {
  try {
    const rows = wrangler(PM_DIR, ["d1", "execute", PM_DB_NAME, "--remote", "--json", "--command", "select slug from sites order by slug"], { json: true });
    return rows?.[0]?.results?.map((r) => r.slug) ?? [];
  } catch { return []; }
}

function connectPmProd() {
  const base = parseJsonc(readFileSync(join(PM_DIR, "wrangler.jsonc"), "utf8"));
  const cfg = buildConfig(base, { vars: { APP_ORIGIN: "http://localhost:3601" } });
  writeGenerated(PM_DIR, cfg, {});
  const created = ensureSecrets(PM_DIR, `# Secrets for prod-remote mode (gitignored). Loaded INSTEAD of .dev.vars when
# scripts/connect.mjs pm prod is active. Use the PRODUCTION values (from your
# password manager — wrangler cannot read deployed secrets back).
CMS_AUTH_SECRET=
SITE_SECRET_KEY=
OPENROUTER_PROVISIONING_KEY=
`);
  console.log(`\n✓ PM → PROD (D1 ${PM_DB_NAME} + KV SESSIONS/HOST_MAP). Wrote ProjectManager/${GEN} + ${MARKER}.`);
  if (created) console.log(`! Created ProjectManager/${SECRETS} — fill the production secrets.`);
  console.log(`→ Restart the PM dev server:  cd ProjectManager && npm run dev\n  ⚠ Every write now hits the REAL PM database + sessions.`);
}

switch (cmd) {
  case "cms":
    if (arg === "prod") connectCmsProd(arg2);
    else if (arg === "local") connectCmsLocal(arg2);
    else connectCmsLocal(arg); // bare slug = local (the safe default)
    break;
  case "pm":
    if (arg === "prod") connectPmProd();
    else if (arg === "local" || !arg) { disconnect(PM_DIR, "PM"); console.log("→ Restart the PM dev server."); }
    else die(`usage: connect pm prod | pm local`);
    break;
  case "local":
    if (!arg || arg === "cms") { disconnect(CMS_DIR, "CMS"); statusLocal(); }
    if (!arg || arg === "pm") disconnect(PM_DIR, "PM");
    console.log("→ Restart the affected dev server(s).");
    break;
  case "status": status(CMS_DIR, "CMS"); status(PM_DIR, "PM"); break;
  case "sites":
    if (!arg || arg === "local") { console.log("LOCAL PM:"); listLocal(); }
    if (!arg || arg === "prod") { console.log("PROD PM:"); console.log(prodSlugs().map((s) => `  ${s}`).join("\n")); }
    break;
  default:
    console.log(`usage:
  connect cms <slug>            local CMS -> that LOCAL PM Site (own D1/R2 under CMS/${SITES_DIR}/<slug>)
  connect cms prod <slug>       local CMS -> that Site's PROD D1/R2 (+ real PM)
  connect pm prod | pm local    local PM  -> PROD D1 + KV, or back to local Miniflare
  connect local [cms|pm]        leave prod-remote mode (CMS keeps its active local Site)
  connect status
  connect sites [local|prod]    list Site slugs`);
    process.exit(cmd ? 1 : 0);
}
