# Journal — ai-openrouter
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-06-22 12:25 — Tracer: OpenRouterAi adapter + fake-fetch unit test (NOT wired in)
- **Status:** DONE
- **What I did:** Added `OpenRouterAi` class to `CMS/src/lib/ports/ai.ts` implementing the same `Ai`
  streaming contract as `CfAi`: POSTs `{ model, messages, stream: true, tools? }` to
  `OPENROUTER_CHAT_URL` (`https://openrouter.ai/api/v1/chat/completions`) with `Authorization: Bearer
  <key>`, returns `response.body` (raw SSE stream) unchanged, throws on non-ok / no-body. `fetch` is
  injected (defaults to global) so it's testable. `gatewayId` accepted for interface parity but unused
  (CF gateway slug doesn't apply to OpenRouter). Exported `OPENROUTER_CHAT_URL`. Rewrote the port's
  top doc comment (~lines 5-9) to record the OpenRouter reversal of the old "no second adapter" note.
  Wrote `CMS/scripts/openrouter-ai.test.mjs` (4 tests, fake fetch, no live key). NOT wired into
  `getAi()` — that's the next slice.
- **Verified:** `node --test scripts/openrouter-ai.test.mjs scripts/ai-port.test.mjs` → 8/8 pass.
  Did NOT run `opennextjs-cloudflare build` (deploy gate; reserved for the end-to-end slice; also the
  caveat warns against running it carelessly). Pre-existing unrelated failure: `ports-sole-reader.guard`
  flags `content-db.ts:39` reading `env.DB` — NOT my change (my code reads no env); predates this run.
- **Files:** `CMS/src/lib/ports/ai.ts`, `CMS/scripts/openrouter-ai.test.mjs`

## 2026-06-22 — Slice 2: select OpenRouter in getAi() + wire the secret
- **Did:** Made `getAi()` select OpenRouter by DEFAULT while keeping `CfAi` as fallback. Selection is
  ONE pure switch `pickSelection(env)` (also exported for testing): OpenRouter when
  `OPENROUTER_API_KEY` is a non-empty string → `new OpenRouterAi(key)`; else CfAi when the `AI` binding
  exists; else `null` (route → 503). `ai.ts` stays the sole env reader (now also reads
  `OPENROUTER_API_KEY`, not routes). Wired the secret end-to-end: declared empty placeholder
  `OPENROUTER_API_KEY` var in `CMS/wrangler.jsonc`; in the deployer added it to the `Env` type, the
  sandbox process env (`env.OPENROUTER_API_KEY ?? ""`), and the `wrangler deploy --var` list — exactly
  alongside the existing CMS_AUTH_SECRET/PM_ORIGIN pattern.
- **Verified:** added 3 selection tests to `openrouter-ai.test.mjs` → `node --test
  scripts/openrouter-ai.test.mjs` 7/7 pass. CMS `tsc --noEmit` 0 errors; deployer `tsc --noEmit -p
  tsconfig.json` 0 errors. Did NOT run `opennextjs-cloudflare build` (a parallel CMS worker owns the
  bundle/components + dev may be up; deploy gate reserved for slice 4). Did NOT run bundle:cms — this
  slice has no user strings (config/secret only), per task instructions.
- **Caveat for deploy:** the deployer must hold its own `OPENROUTER_API_KEY` secret
  (`wrangler secret put OPENROUTER_API_KEY` in deployer/) before a live deploy passes a real key down;
  absent => empty => CMS auto-falls-back to CfAi. No regression for un-keyed Sites.
- **Files:** `CMS/src/lib/ports/ai.ts`, `CMS/scripts/openrouter-ai.test.mjs`, `CMS/wrangler.jsonc`,
  `deployer/src/index.ts`

## 2026-06-22 — Slice 3: point the model catalog at OpenRouter
- **Did:** Swapped the catalog source from CF Workers-AI to OpenRouter, shape-only — the
  `CatalogModel` boundary + all pure helpers (`groupByProvider`/`sortByPrice`/`filterCatalog`/
  `isKnownModel`/`resolveModel`) and the picker/route consumers are untouched. In
  `CMS/src/lib/chat/models.ts`: `parseModelCatalog` now reads OpenRouter's `{ data: [{ id, name,
  pricing: { prompt } }] }` (tolerates a bare array + junk w/o `id`); `providerOf` takes the FIRST
  `vendor/model` segment (was the 2nd of `@cf/<vendor>/...`); `priceOf` reads `pricing.prompt`
  (USD/token string→number); `DEFAULT_MODEL = "openai/gpt-4o-mini"`; static `CHAT_MODELS` = 4
  OpenRouter chat models (openai/gpt-4o-mini, openai/gpt-4o, anthropic/claude-3.5-sonnet,
  google/gemini-flash-1.5). In `GET /api/chat/models`: `fetchLiveCatalog` now hits
  `https://openrouter.ai/api/v1/models` (public endpoint; sends `env.OPENROUTER_API_KEY` as Bearer
  when present, read via the SAME `getCloudflareContext` env boundary — still tries un-keyed if no
  CF context); kept the D1 cache + 12h lazy refresh + static fallback exactly. Chat route needed NO
  change: it already validates untrusted `model` via `resolveModel(cachedIds ∪ static) → DEFAULT_MODEL`,
  so it now resolves to OpenRouter ids automatically and never forwards arbitrary strings.
- **Verified:** rewrote `scripts/models.test.mjs` for the OpenRouter shape → `node --test
  scripts/models.test.mjs` 12/12 pass; AI port suites still green (`openrouter-ai` + `ai-port` 11/11).
  CMS `tsc --noEmit`: 0 errors in MY files (chat catalog). The only 2 tsc errors are pre-existing in
  the PARALLEL worker's `src/components/components/components-manager.tsx` (date typing) — not mine,
  out of my scope. Did NOT run `opennextjs-cloudflare build` (deploy gate; reserved for slice 4
  end-to-end + parallel worker owns the bundle/components & dev may be up). Did NOT run bundle:cms —
  catalog swap has zero new user strings.
- **Files:** `CMS/src/lib/chat/models.ts`, `CMS/src/app/api/chat/models/route.ts`,
  `CMS/scripts/models.test.mjs`

## 2026-06-22 15:19 — per-Site OpenRouter key TRACK, Slice 1 (PM crypto helper + schema + migration)
- **Status:** DONE
- **What I did:** NEW TRACK (NOT this goal's CMS catalog work — PM-side, each Site stores its OWN
  OpenRouter key encrypted at rest). Slice 1 of 4: (1) `ProjectManager/src/lib/crypto/secret-box.ts`
  — AES-256-GCM via Web Crypto `crypto.subtle`; `encryptSecret(plaintext, keyB64)` →
  base64(iv[12]‖ciphertext+tag), `decryptSecret(blob, keyB64)` → plaintext; random 12-byte IV per
  call; KEK is the 32-byte base64 `SITE_SECRET_KEY` used DIRECTLY as the AES key (NO PBKDF2 — dodges
  Workers 100k cap); tamper/short/wrong-key → clean throw, never garbage. (2) Added
  `openrouterApiKeyEncrypted` (text, nullable) to the `sites` table; generated migration
  `0010_bizarre_madrox.sql` (single ALTER ADD; re-run shows no drift). (3) Documented `SITE_SECRET_KEY`
  as a SECRET placeholder/comment in `ProjectManager/wrangler.jsonc` + added a P1 HITL ## Open item
  (`wrangler secret put SITE_SECRET_KEY`). (4) 5 dep-free tests in `scripts/secret-box.test.mjs`
  (round-trip, IV-uniqueness, tamper-throws, wrong-key-throws, short-throws) using a fixed test key.
- **Verified:** Inside ProjectManager/: `npx tsc --noEmit` clean (fixed `Uint8Array<ArrayBuffer>`
  strictness for `crypto.subtle` BufferSource), `npm test` 135/135 pass (incl. the 5 new),
  `npx opennextjs-cloudflare build` green (dev confirmed off via lsof 3601/3602). Drizzle re-generate
  reports "No schema changes" → no drift. Did NOT touch CMS/ or deployer/ (later slices).
- **Files:** `ProjectManager/src/lib/crypto/secret-box.ts`, `ProjectManager/scripts/secret-box.test.mjs`,
  `ProjectManager/src/db/schema.ts`, `ProjectManager/migrations/0010_bizarre_madrox.sql`,
  `ProjectManager/wrangler.jsonc`, `HITL.md`

## 2026-06-22 — per-Site OpenRouter key TRACK, Slice 2 (PM write-only key UI + encrypt-on-PATCH)
- **Status:** DONE
- **What I did:** Slice 2 of 4. (1) `ProjectManager/src/lib/site/openrouter-key.ts` — pure,
  alias-free `parseOpenrouterKey(body)` → `{ openrouterApiKey?: string (trimmed, undefined when
  blank), clearOpenrouterKey: boolean (only `=== true`) }`. Extracted so it's importable from a bare
  `node --test`. (2) Extended `parseSiteBody` (`src/app/api/sites/route.ts`) — `SiteBody` +
  `ParsedSite` now carry the two new fields via `parseOpenrouterKey`. POST ignores them (create has no
  key UI). (3) PATCH `src/app/api/sites/[id]/route.ts` — after `updateSite`: `clearOpenrouterKey` →
  `setSiteOpenrouterKey(id, null)`; else non-blank `openrouterApiKey` → read `env.SITE_SECRET_KEY`
  (via `getCloudflareContext` + `(env as unknown as Record<string,unknown>).SITE_SECRET_KEY`),
  `encryptSecret(plaintext, kek)` → `setSiteOpenrouterKey(id, ciphertext)`. Missing/empty KEK → 500.
  Gated by the EXISTING Site-edit authz (`canUserCreateSite` + `canManageSiteByCountry` + country
  scope) — same path as name/slug/country. (4) `setSiteOpenrouterKey(id, ciphertextOrNull)` in
  `src/lib/site/site.ts` (never reads the column back). (5) `SiteForm` (edit mode only): password
  `Input` + "Clear key" button + status hint (set/none/will-clear) driven by a `hasOpenrouterKey`
  prop; submit blank ≠ clear, only the Clear button arms `clearOpenrouterKey: true`. (6) Detail page
  passes `hasOpenrouterKey={site.openrouterApiKeyEncrypted != null}` (boolean, never ciphertext).
  (7) EN/FI/ET parity for 6 new `sites.form.openrouter*` strings.
- **REQUEST/RESPONSE CONTRACT for Slice 3:** request body fields = `openrouterApiKey` (plaintext
  set/replace) + `clearOpenrouterKey: true`. The "is a key set" signal exposed to the client =
  `hasOpenrouterKey: boolean` (the detail page derives it server-side from
  `openrouterApiKeyEncrypted != null`; there's no JSON Site-list endpoint that needed changing —
  PM Site pages are server-rendered). Ciphertext/plaintext are NEVER returned.
- **Verified:** Inside ProjectManager/: `npx tsc --noEmit` clean, `npm test` 140/140 pass (incl. 5
  new in `src/lib/site/openrouter-key.test.ts`: trim/set, blank≠clear over ["","   ",undefined],
  only `=== true` clears + truthy-not-true does NOT, neither-present), `npx opennextjs-cloudflare
  build` green (dev confirmed off via lsof 3601/3602). Did NOT touch CMS/ or deployer/.
- **Files:** `ProjectManager/src/lib/site/openrouter-key.ts` (+`.test.ts`),
  `ProjectManager/src/app/api/sites/route.ts`, `ProjectManager/src/app/api/sites/[id]/route.ts`,
  `ProjectManager/src/lib/site/site.ts`, `ProjectManager/src/app/(app)/sites/site-form.tsx`,
  `ProjectManager/src/app/(app)/sites/[id]/page.tsx`, `ProjectManager/messages/{en,fi,et}.json`

## 2026-06-22 15:31 — per-Site OpenRouter key TRACK, Slice 3 (thread decrypted key into deploy POST)
- **Status:** DONE
- **What I did:** Slice 3 of 4. PM deploy route now passes each Site's OWN OpenRouter key
  (plaintext) to the deployer over the EXISTING HTTPS `/deploy` call — no deployer changes this slice.
  (1) `ProjectManager/src/lib/site/deploy-openrouter-key.ts` — pure `decideDeployOpenrouterField(
  encryptedOrNull, decryptThunk)` → `{ body: { openrouterApiKey? }, degraded }`. null/empty → omit;
  decrypt-ok → include plaintext under `openrouterApiKey`; decrypt-throws → omit + `degraded: true`.
  (2) `src/app/api/sites/[id]/deploy/route.ts` — after the deployer-config check: read
  `bag.SITE_SECRET_KEY` (same `(env as Record<...>)` boundary as DEPLOYER_SECRET); if
  `site.openrouterApiKeyEncrypted` set, `await decryptSecret(blob, kek)` in a try/catch (failure →
  `decrypted=null`); feed both into the pure helper; on `degraded` log a `console.warn` and proceed.
  Merge `...openrouterBody` into the POST `JSON.stringify({ siteId, slug, ...ref, ...openrouterBody })`.
  Decrypt happens BEFORE the `setSiteDeployStatus("deploying")` latch but can NEVER fail the deploy.
  (3) `scripts/deploy-openrouter-key.test.mjs` — 6 dep-free tests (present→include, null/undefined/
  ""→omit, throws→omit+degraded, spread-merge safety). Uses a FAKE plaintext + injected thunk; no
  real key, no Web Crypto. `findSiteById` already returns the full `Site` row incl.
  `openrouterApiKeyEncrypted` — no DB change needed.
- **CONTRACT for Slice 4 (deployer):** the deploy POST body MAY now carry `openrouterApiKey: string`
  (plaintext, present ONLY when the Site has a key that decrypts cleanly). Absent when the Site has no
  key OR decryption failed (graceful degrade). Slice 4 sets it as the CMS Worker SECRET and drops the
  `--var`, falling back to the deployer's own global `OPENROUTER_API_KEY` when the field is absent.
- **Verified:** Inside ProjectManager/: `npx tsc --noEmit` clean, `npm test` 146/146 pass (incl. 6
  new), `npx opennextjs-cloudflare build` green (dev confirmed off via lsof 3601/3602 before build).
  Did NOT touch CMS/ or deployer/.
- **Files:** `ProjectManager/src/lib/site/deploy-openrouter-key.ts` (+`scripts/*.test.mjs`),
  `ProjectManager/src/app/api/sites/[id]/deploy/route.ts`

## 2026-06-22 — per-Site OpenRouter key Slice 4: deployer sets OPENROUTER_API_KEY as a CMS Worker SECRET
- **Status:** DONE
- **What I did:** In `deployer/src/index.ts` ONLY: (1) `DeployBody` now accepts optional
  `openrouterApiKey?: string`; the `/deploy` handler reads it (only when it's a string) and threads it
  into `startDeploy`. (2) Added pure `effectiveOpenrouterKey(perSite, global)` → `{ key, setSecret }`:
  per-Site body key wins when non-empty, else the deployer's own `env.OPENROUTER_API_KEY`, else "";
  `setSecret = key.length > 0`. (3) The container process env now carries the EFFECTIVE key in
  `OPENROUTER_API_KEY` plus a `SET_OPENROUTER_SECRET` flag ("1"/""). (4) In the generated bash: REMOVED
  the `--var "OPENROUTER_API_KEY:$OPENROUTER_API_KEY"` line; AFTER `wrangler deploy` succeeds, when
  `SET_OPENROUTER_SECRET` is non-empty, run `printf '%s' "$OPENROUTER_API_KEY" | npx wrangler secret put
  OPENROUTER_API_KEY --name "$WORKER_NAME"` (own `secret` step with fail handling). Empty effective key
  → secret-put skipped entirely (no blank secret; CMS then falls back to Workers AI). The value goes via
  stdin (printf|), NEVER inlined into argv, and is never echoed in any log/audit line. SITE_ID /
  PM_ORIGIN / CMS_AUTH_SECRET / APP_ORIGIN / GOOGLE_* stay as `--var` unchanged.
- **Verified:** `npx wrangler deploy --dry-run` in deployer/ → bundle clean (deployer has no tsc per
  project memory; dry-run is the gate). New `deployer/scripts/openrouter-key.test.mjs` (8 assertions,
  dep-free) → all pass. The helper is MIRRORED in the test because `src/index.ts` can't import under
  Node (pulls @cloudflare/containers, Workers-only). Did NOT touch CMS/ or ProjectManager/.
- **HITL:** appended a P1 item to root `HITL.md` to live-verify a per-Site key reaches a deployed CMS
  (the `wrangler secret put` + live OpenRouter call are HITL).
- **Files:** `deployer/src/index.ts`, `deployer/scripts/openrouter-key.test.mjs`

## 2026-06-23 16:40 — CMS catalog Slice 4: end-to-end verify (offline gate)
- **Status:** DONE (codeable part; live deploy/chat-stream is HITL)
- **What I did:** Verification-only run, no source changes. Confirmed the full OpenRouter swap
  (adapter + getAi selection + catalog) holds at the deploy gate. Ran the offline verification the
  BACKLOG "Verify end-to-end" task asks for: OpenRouter unit tests, the whole CMS suite, and the
  `npx opennextjs-cloudflare build` deploy gate. Flipped that BACKLOG TODO → DONE.
- **Verified:** dev OFF (lsof 3601/3602 clear) before building. `node --test
  scripts/openrouter-ai.test.mjs scripts/ai-port.test.mjs scripts/models.test.mjs` → 23/23 pass.
  `npm test` (full CMS suite) → **748/748 pass, 0 fail**. NOTE: the long-standing pre-existing
  failure flagged in CAVEATS — `ports-sole-reader.guard` on `content-db.ts:39` — now PASSES (4/4);
  another track fixed `content-db.ts` to read `env.DB` via the port boundary. `npx
  opennextjs-cloudflare build` → green ("OpenNext build complete", worker.js saved). NOT verifiable
  offline (HITL): live chat stream from OpenRouter + a real tool-call round-trip + the picker
  showing the live catalog on a deployed CMS — these need the deployer's `OPENROUTER_API_KEY` secret
  and a live deploy; tracked in root HITL.md.
- **Files:** `.orchestrator/meeseeks/goals/ai-openrouter/{BACKLOG,JOURNAL,CAVEATS,NEXT}.md` only
