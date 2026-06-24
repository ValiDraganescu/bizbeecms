# Caveats — ai-openrouter
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- The `Ai` port (`CMS/src/lib/ports/ai.ts`) is the ONLY place that reads `env.AI`. Keep that property:
  the OpenRouter adapter reads `OPENROUTER_API_KEY` via the same boundary, not from scattered code.
- `CfAi` is the existing Cloudflare adapter — KEEP it as a fallback. The port exists to make providers
  swappable; deleting the first plug defeats the point.
- The chat route's `model` field is UNTRUSTED and must NEVER 400 — validate against the cached catalog
  ids (or static fallback), fall back to `DEFAULT_MODEL`. Don't forward arbitrary strings upstream.
- `npx opennextjs-cloudflare build` is the deploy gate. NEVER run it while `npm run dev` (3601/3602) is
  running — it corrupts `.next`. Stop dev first.
- OpenRouter is OpenAI-compatible but expects a real key; unit-test the adapter against a FAKE `fetch`
  (see archived binding-adapters' `scripts/ai-port.test.mjs`) — no live calls in tests.
- Prior context lives in `goals/archive/ai-assistant/` and `goals/archive/binding-adapters/` — read
  their JOURNAL/CAVEATS; this goal continues that work, doesn't restart it.
- `OpenRouterAi` (in `ai.ts`) takes `fetch` as a constructor arg (defaults to global) so the unit test
  can drive a fake — DON'T hardcode global `fetch` if you refactor; the test depends on injection.
- It returns `response.body` (the SSE stream) directly. OpenRouter is OpenAI-compatible so this is the
  same delta+tool-call SSE shape the route's reframer already handles — no extra translation needed.
- ~~Pre-existing: `ports-sole-reader.guard.test.mjs` FAILS on `content-db.ts:39`.~~ RESOLVED — as of
  2026-06-23 that guard PASSES (4/4); another track fixed `content-db.ts`. Full CMS `npm test` is now
  748/748 with ZERO failures. If you see a fail, it's a real regression — don't dismiss it as "pre-existing".
- The model id for OpenRouter is provider-prefixed (e.g. `openai/gpt-4o-mini`), NOT the `@cf/...` form.
  Remember when setting `DEFAULT_MODEL` in the catalog slice.
- Provider selection is by KEY PRESENCE (`pickSelection` in `ai.ts`): a non-empty `OPENROUTER_API_KEY`
  → OpenRouter, else CfAi, else null→503. An EMPTY string is NOT a key (falls back to CfAi) — the
  `CMS/wrangler.jsonc` placeholder is intentionally empty so un-keyed Sites still use CF, no regression.
- For OpenRouter to actually be active on a deployed CMS, the DEPLOYER worker must hold its own
  `OPENROUTER_API_KEY` secret (`wrangler secret put OPENROUTER_API_KEY` in `deployer/`). The deployer
  passes it down via `--var`; without it the var is "" and the CMS silently uses CfAi.
- CATALOG SHAPE (slice 3): `parseModelCatalog` now expects OpenRouter's `{ data: [...] }` (id, name,
  pricing.prompt) — NOT the CF `{ result: [...] }` (name, task, properties[]). `providerOf` takes the
  FIRST `vendor/model` segment now (was the 2nd of `@cf/...`). If you ever re-enable CfAi's catalog
  you'd need a per-provider parser; don't assume one shape fits both.
- `GET /api/chat/models` hits OpenRouter's PUBLIC `/api/v1/models` (no key strictly required) — it
  works un-keyed in local dev. The key is sent only for attribution. So the picker shows the live
  OpenRouter list even before the deployer secret is set; only actual chat completions need the key.
- ~~`CMS/src/app/api/translate/route.ts` STILL has its own hardcoded `@cf/...` DEFAULT_MODEL.~~
  RESOLVED 2026-06-23: translate now imports `DEFAULT_MODEL` from `lib/chat/models.ts` (the OpenRouter
  id), so it runs on whatever provider `getAi()` selects — unified with the chat route. The whole AI
  provider story is now OpenRouter-first end to end. NOTE: un-keyed Sites fall back to `CfAi`, which
  would receive the OpenRouter id (CF would reject `openai/gpt-4o-mini`). This is the SAME pre-existing
  behavior the chat route already had (it also sends the catalog default to CfAi) — the settled design
  is OpenRouter-first; un-keyed CF chat/translate was never the supported path. Don't "fix" it by
  re-adding a `@cf/` id — that re-breaks the keyed path the regression test guards.
- PER-SITE OPENROUTER KEY TRACK (separate from the CMS catalog work): PM stores each Site's OWN
  OpenRouter key ENCRYPTED in `sites.openrouterApiKeyEncrypted` (col added migration 0010). Crypto
  lives in `ProjectManager/src/lib/crypto/secret-box.ts`: AES-256-GCM, `encryptSecret`/`decryptSecret`
  take `(text, keyB64)`; KEK is the PM secret `SITE_SECRET_KEY` (32-byte base64, used directly — NO
  PBKDF2). It THROWS on tamper/wrong-key/short — never returns garbage. Read the secret via the
  `(env as unknown as Record<string,unknown>).SITE_SECRET_KEY` pattern (same as DEPLOYER_SECRET).
- PER-SITE KEY Slice 2 CONTRACT (Slice 3 must match): the Site PATCH body accepts `openrouterApiKey`
  (plaintext set/replace; TRIMMED; a blank/whitespace field is NO-CHANGE, never a clear) and
  `clearOpenrouterKey` (only the literal `=== true` wipes — truthy strings/numbers do NOT, by design).
  The client-facing "is a key set" signal is `hasOpenrouterKey: boolean`, derived server-side from
  `openrouterApiKeyEncrypted != null`. The encrypted/plaintext key is NEVER returned to the client.
  PM Site pages are server-rendered (no JSON Site-list endpoint exposes the key). Pure parse lives in
  `src/lib/site/openrouter-key.ts`; DB write in `src/lib/site/site.ts#setSiteOpenrouterKey`.
- For `crypto.subtle` on the Workers types, byte arrays passed to encrypt/decrypt/importKey must be
  `Uint8Array<ArrayBuffer>` (allocate via `new Uint8Array(new ArrayBuffer(n))` / `getRandomValues(new
  Uint8Array(new ArrayBuffer(n)))`), else tsc errors on SharedArrayBuffer-vs-ArrayBuffer BufferSource.
- Dep-free `.mjs` tests CAN import a `.ts` source directly under Node 24 (native type-stripping) — e.g.
  `import { encryptSecret } from "../src/lib/crypto/secret-box.ts"`. No loader/flag needed. The PM test
  glob is `scripts/**/*.test.mjs` (run via `npm test`).
- PER-SITE KEY Slice 3 DONE: PM deploy route (`src/app/api/sites/[id]/deploy/route.ts`) now puts
  `openrouterApiKey: <plaintext>` into the deployer POST body when the Site has a key that decrypts
  cleanly (KEK = `SITE_SECRET_KEY` via the `(env as Record<...>)` boundary). Decrypt failure → field
  OMITTED + a `console.warn` + the deploy STILL proceeds (graceful degrade to the deployer global key).
  The deploy must NEVER 500 because of the key. Decision logic is the pure
  `src/lib/site/deploy-openrouter-key.ts#decideDeployOpenrouterField` — keep it pure/testable.
- Slice 4 (deployer) CONTRACT: deploy POST body field is exactly `openrouterApiKey` (plaintext,
  present only sometimes). Deployer must set it as the CMS Worker SECRET `OPENROUTER_API_KEY` and drop
  the `--var`, falling back to its own global `OPENROUTER_API_KEY` when the field is absent.
- PER-SITE KEY Slice 4 DONE: `deployer/src/index.ts`. Pure `effectiveOpenrouterKey(perSite, global)`
  → `{ key, setSecret }` (perSite-non-empty ?? global ?? ""; setSecret = key.length>0). The bash sets
  the key as a Worker SECRET (`printf '%s' "$OPENROUTER_API_KEY" | npx wrangler secret put
  OPENROUTER_API_KEY --name "$WORKER_NAME"`) AFTER `wrangler deploy` succeeds, gated on the
  `SET_OPENROUTER_SECRET` process-env flag so a blank key skips the secret-put. The `--var
  OPENROUTER_API_KEY` line is GONE — all other CMS vars stay `--var`. Value flows via process env →
  stdin only; NEVER echoed/inlined into argv. The deployer has NO tsc (it imports @cloudflare/sandbox,
  Workers-only) — `npx wrangler deploy --dry-run` is the gate. `src/index.ts` CANNOT be imported under
  Node, so the helper is MIRRORED in `deployer/scripts/openrouter-key.test.mjs` (keep in sync if you
  change the source helper). The deployer track is now COMPLETE (all 4 slices); only HITL live-verify
  remains (see root HITL.md).
- KEY-MINTING Slice 2 DONE: migration is now `0012_far_johnny_blaze.sql` (NEXT.md said "last was 0010"
  but 0011 = password_resets had landed; current last = 0012). `sites` gained `openrouterMintingEnabled`
  (bool NOT NULL default false), `openrouterKeyHash` (text null), `openrouterMonthlyLimitUsd` (int null).
  The minted `sk-or-...` still reuses `openrouterApiKeyEncrypted` (no new column/crypto). When you add
  the next migration, run `npx drizzle-kit generate` AFTER editing schema.ts (never hand-write SQL).
- KEY-MINTING TRACK Slice 1 DONE: `ProjectManager/src/lib/openrouter/provision.ts`. `mintKey(provKey,
  {name, limit?}, fetch?)` → `{ key: "sk-or-...", hash }` from OpenRouter's `{ key, data: { hash } }`;
  `deleteKey(provKey, hash, fetch?)` → DELETE `/api/v1/keys/:hash` (hash encodeURIComponent'd). Both
  throw on non-2xx + missing creds (guarded before fetch). `limit` is OMITTED from the body when
  null/undefined (= no cap) — don't send `limit: null`. The provisioning key is the SINGLE PM secret
  `OPENROUTER_PROVISIONING_KEY` (NOT per-site); declared as a comment in PM wrangler.jsonc. Reuse the
  EXISTING `sites.openrouterApiKeyEncrypted` (secret-box.ts) to store the minted `key`; the `hash` needs
  a NEW column (Slice 2). PM test glob `scripts/**/*.test.mjs` — node imports `.ts` directly (no loader).
- KEY-MINTING Slice 3 DONE: the manual paste field is GONE. The Edit Site form (`site-form.tsx`) now
  sends `openrouterMintingEnabled` (bool) + `openrouterMonthlyLimitUsd` (number|null), NEVER a key.
  Pure parse = `src/lib/site/openrouter-minting.ts#parseOpenrouterMinting` (toggle `=== true`-only;
  limit floored non-negative int, trims string input so whitespace/""/invalid/negative → null = no cap).
  `parseSiteBody`'s `SiteBody`/`ParsedSite` swapped key fields for these two. PATCH route persists them
  via `updateSite` (`UpdateSiteInput` gained both cols). The OLD `openrouter-key.ts` (paste parser) +
  its test were DELETED — don't resurrect them. PM Site pages are server-rendered; client signal is
  `hasMintedOpenrouterKey` (from `site.openrouterKeyHash != null`), NOT `hasOpenrouterKey` (removed).
- `setSiteOpenrouterKey` (site.ts) is now unused by any route but KEPT on purpose — Slice 5
  (mint-on-deploy) encrypts the minted `sk-or-...` through it into `openrouterApiKeyEncrypted`.
- PM has NO Switch/Toggle UI component (only Button/Card/Table/Field/Input/Badge/Combobox/Alert/
  ConfirmDialog). For toggles use a styled native `<input type="checkbox" className="... accent-primary
  focus-visible:ring-2 focus-visible:ring-ring">` — no new component needed.
- The "Delete current key" button in the Edit form is a DISABLED STUB (no onClick endpoint yet). Slice 5
  must add `DELETE /api/sites/[id]/openrouter-key` (deleteKey + null out hash+encrypted) and wire it.
- PM test glob is BOTH `src/lib/**/*.test.ts` AND `scripts/**/*.test.mjs` (see package.json `test`).
  A `.test.ts` next to its source under `src/lib/` IS run by `npm test` — the earlier caveat that said
  "PM test glob is scripts/**/*.test.mjs" is INCOMPLETE; co-located `.test.ts` works too.
- KEY-MINTING Slice 5 DONE: mint-on-deploy lives in the deploy route, gated on pure
  `shouldMintOnDeploy(enabled, keyHash)` (`src/lib/site/mint-on-deploy.ts` — `=== true` toggle,
  hash null/"" → mint). Persistence is `setSiteMintedOpenrouterKey(id, ciphertext, hash)` /
  `clearSiteMintedOpenrouterKey(id)` in site.ts (write BOTH cols together). `setSiteOpenrouterKey`
  (encrypted-only setter) is now truly unused — leave it or it can be deleted in a cleanup pass.
- The mint block MUTATES the in-memory `site` (`site.openrouterApiKeyEncrypted`/`openrouterKeyHash`)
  after persisting, so the existing Slice-3 `decideDeployOpenrouterField` decrypt-and-thread block
  below it picks up the freshly minted key in the SAME request. Don't reorder them — mint must run first.
- DELETE endpoint = `/api/sites/[id]/openrouter-key` (route.ts, DELETE handler). Authz mirrors the
  deploy route (country-reach OR `site_users` assignment), NOT the PATCH route's `canUserCreateSite`.
  It is PROCEED-AND-CLEAR: remote `deleteKey` failure (incl. 404 already-gone) is caught+warned and
  local state is cleared anyway; a no-hash Site returns `{ok:true}` without calling OpenRouter.
- `OPENROUTER_PROVISIONING_KEY` is read in BOTH the deploy route and the DELETE route via the
  `(env as Record<string,unknown>).OPENROUTER_PROVISIONING_KEY` boundary (same pattern as SITE_SECRET_KEY).
  It's still only a COMMENT in PM wrangler.jsonc — a live mint/delete needs `wrangler secret put
  OPENROUTER_PROVISIONING_KEY` on PM (HITL). Without it, `mintKey` throws → caught → global fallback.
- The form delete button now uses local `hasKey` state (seeded from `hasMintedOpenrouterKey`) + a
  `deleting` loading flag; on 2xx it flips `hasKey=false` and `router.refresh()`. The old DISABLED-stub
  caveat is now stale.
- CMS-LOCAL USER-KEY OVERRIDE DONE (2026-06-23): the CMS now has its OWN OpenRouter key (operator-pasted),
  stored encrypted in CMS D1 (`site_settings` row `openrouter_user_key` = `{keyEnc}`, secret-box AES-GCM,
  KEK = CMS Worker var `CMS_AUTH_SECRET` — same KEK google-client-store uses). `getAi()` PREFERS it over
  `env.OPENROUTER_API_KEY`. Pure precedence = `lib/settings/openrouter-key.ts#effectiveOpenrouterKey`;
  store = `db/openrouter-key-store.ts` (mirror of google-client-store, `injectedDb` seam, node-testable).
- CRITICAL: `CMS/src/lib/ports/ai.ts` is imported DIRECTLY by dep-free `.mjs` tests (ai-port,
  openrouter-ai, ports-factory) under Node type-stripping — so ANY import added to `ai.ts` MUST be a
  RELATIVE `.ts` path (`../../db/...`, `../settings/...`), NEVER a `@/` alias (Node can't resolve `@/`,
  every importing test ERR_MODULE_NOT_FOUNDs). Learned the hard way this run.
- `getAi()` reads the CMS-local key inside a try/catch → null on any failure; `effectiveOpenrouterKey`
  then falls through to the env key. The chat route must NEVER 500 because of a settings read — keep that
  guard if you touch `getAi()`. `pickSelection` stays PURE & env-shaped (`{OPENROUTER_API_KEY, AI}`) —
  the override is applied BEFORE calling it, not inside it.
- The request-time D1 read in `getAi()` is one indexed `site_settings` lookup per chat request (cheap,
  no cache). If chat latency ever matters, cache per-isolate — but YAGNI for now.
- CMS settings tab + page live at `/admin/settings/openrouter-key`; route `/api/settings/openrouter-key`.
  i18n block `openrouterKey` + `settingsNav.openrouterKey` in all three `CMS/messages/{en,fi,et}.json`.
- DEPLOY-FALLBACK WARNINGS (PM deploy route → form): the accepted deploy response can carry TWO
  non-blocking warning flags, both pure response flags that DON'T change the graceful-degrade behavior:
  `mintWarning` (mint-on-deploy failed → global key) and `keyWarning` (stored per-Site key failed to
  decrypt → global key, from the existing `degraded` value). Form (`deploy-form.tsx`) renders each as a
  `tone="warning"` Alert: `t("mintWarning")` then `t("keyWarning")`. i18n keys `sites.deploy.mintWarning`
  + `sites.deploy.keyWarning` in PM `messages/{en,fi,et}.json`. Regression: `scripts/deploy-mint-warning.test.mjs`
  (10 tests) source-greps the route's conditional `...(degraded ? { keyWarning: true } : {})` + form
  reads + i18n parity — the route can't be imported under Node (pulls the CF context).
- MODEL PRICE DISPLAY (2026-06-24): `CatalogModel.price` is the INPUT-price SORT KEY — DON'T remove
  it; `sortByPrice`/`groupByProvider` depend on it. New `inputPrice`/`outputPrice` are for DISPLAY
  (USD/token, null when absent). Format with the pure `pricePerMillion()` (× 1e6, `.toFixed(2)`),
  never print raw `$/token`. Static `CHAT_MODELS` have all three null (no live price) — the picker
  shows nothing for them, by design; keep new static models null unless you have a real price.
- CATALOG FILTER (2026-06-24): `parseModelCatalog` now DROPS any model whose
  `supported_parameters` doesn't include `"tools"` (pure `supportsTools()`). The picker shows only
  tool-capable models — the assistant is tool-driven. Tests must give SAMPLE entries
  `supported_parameters: ["tools"]` or they vanish from the parsed catalog. The `/api/chat/models`
  route passes RAW OpenRouter JSON to the parser, so new fields (`supported_parameters`,
  `architecture.*`) are visible there with NO route change — parse them in `models.ts`.
- There is NO `bundle:cms` npm script — the "cms-bundle regen" some NEXT/BACKLOG notes mention is
  ONLY for runtime-shipped UI artifacts (components/css), NOT for `.ts` modules like `models.ts`,
  which `next build` bundles normally. A pure catalog/helper change needs no bundle regen.
- CONCURRENT ai-widget-ux Meeseeks shares `CMS/messages/{en,fi,et}.json` + `chat-widget.tsx`.
  As of this run those files also carry their `sizeHalf`/`sizeCompact` keys and a `panel-size.*`
  feature. If `npm test` shows a `panel-size.test.ts` fail ("nextPreset toggles default<->half"),
  it's THEIRS (untracked file), not a regression in this goal — don't chase it.
