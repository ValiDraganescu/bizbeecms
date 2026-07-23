# AI cost/quotas — implementation contracts

Companion to `docs/ai-cost-quotas.md` (the WHY + architecture). This file pins
the exact cross-slice interfaces so parallel implementers never negotiate
shapes ad hoc. **If a slice needs to deviate from a contract here, it must ask
the manager first — never silently change a shape another slice consumes.**

Grounded facts (verified 2026-07-23):

- Every deployed CMS Worker has env vars `SITE_ID`, `PM_ORIGIN`,
  `CMS_AUTH_SECRET`, `APP_ORIGIN` + secret `OPENROUTER_API_KEY`
  (`deployer/src/index.ts:931-950`). `CMS_AUTH_SECRET` is PM-wide (same for
  all sites); site identity = `SITE_ID`. CMS→PM M2M calls use
  `Authorization: Bearer <CMS_AUTH_SECRET>` (pattern:
  `CMS/src/app/api/auth/sso-callback/route.ts`, PM gate:
  `ProjectManager/src/app/api/auth/cms-validate/route.ts:32-39`).
- Site CMS workers are reachable at
  `https://bizbeecms-cms-<slug>.<WORKERS_SUBDOMAIN>.workers.dev`
  (`router/src/index.ts:79`; subdomain today `vali-draganescu88`).
- **No DB migrations anywhere in this feature.** PM uses the existing
  `appSettings` key/value table (`ProjectManager/src/db/schema.ts:322`); CMS
  uses existing `site_settings` + `usage_counter` tables.
- `sites.openrouterMonthlyLimitUsd` (integer USD) is REDEFINED as **the
  customer monthly quota** (billable dollars). The OpenRouter key limit
  becomes a derived circuit-breaker cap (see Contract F), no longer equal to
  this field.

## Slice map

Wave 1 (parallel): **W1-A pm-curation** (PM), **W1-B cms-config** (CMS),
**W1-C cms-metering** (CMS).
Wave 2 (parallel, after wave-1 merge): **W2-D cms-enforcement** (CMS),
**W2-E cms-cleanup** (CMS), **W2-F pm-dashboards** (PM).

## Shared invariants

- Money at rest = **integer nano-USD** (1 USD = 1_000_000_000). Helpers
  `NANO_USD_PER_USD`, `formatUsdFromNano` exist in
  `CMS/src/lib/public-chat/core.ts`. PM/API payloads use plain USD numbers.
- REST route handlers + fetch only — **server actions are banned** (500 on
  OpenNext/Workers).
- Tests: pure logic only, dep-free modules, `node --test`. Never test
  stores/ORM/routes directly; extract pure helpers and test those.
- Nothing here pushes to origin, deploys, or runs `opennextjs-cloudflare
  build`.
- Config-unavailable fallback: when the cached AI config is missing (fresh
  site, PM unreachable, local dev without PM), the CMS behaves exactly as
  today — legacy default models, margin 0, **no quota enforcement**.

## Contract A — PM curated-config endpoint (W1-A serves, W1-B consumes)

`GET {PM_ORIGIN}/api/cms/ai-config?siteId=<SITE_ID>`
Auth: `Authorization: Bearer <CMS_AUTH_SECRET>` (same gate style as
`cms-validate`). 401 bad/missing bearer; 404 unknown siteId.

200 response body:

```jsonc
{
  "version": 1,
  "purposes": {
    "chatAgent":     { "models": [ { "key": "fast-chat", "label": "Fast chat", "model": "openai/gpt-4o-mini", "marginPct": 30 } ] },
    "assistant":     { "models": [ /* same entry shape */ ] },
    "imageDescribe": { "models": [] },
    "imageGenerate": { "models": [] },
    "translate":     { "models": [] }
  },
  "quota": { "monthlyUsd": 10 }   // sites.openrouterMonthlyLimitUsd; null = no quota
}
```

- All five purpose keys are always present (possibly empty lists).
- Entry order matters: **first entry = the purpose default**.
- `key`: stable slug `[a-z0-9-]{1,40}`, unique within its purpose, never
  renamed once created. `label`: free text. `model`: OpenRouter id.
  `marginPct`: number ≥ 0 (integer expected, don't enforce).

PM storage (existing `appSettings` table, new keys):
- `ai_curated_models` — JSON: the `purposes` object above, exactly.
- `ai_credit_pool_usd` — stringified number; global monthly pool.

Seed `ai_curated_models` on first read if absent (margin 30 everywhere):
chatAgent + assistant + imageDescribe + translate → `openai/gpt-4o-mini`;
imageGenerate → `google/gemini-2.5-flash-image`. Keys/labels: `standard` /
"Standard" for each single-entry list.

Pool + quota validation (W1-A): PATCH of a site's
`openrouterMonthlyLimitUsd` and pool edits both re-validate
`sum(all sites' quotas) ≤ pool` → 400 with a clear message on violation.
Null quotas count as 0.

## Contract B — CMS `lib/ai-config` module (skeleton committed by manager)

Files under `CMS/src/lib/ai-config/`:

- `types.ts` (manager-owned, committed): `AiPurpose`, `CuratedModel`,
  `AiConfig` (mirror of Contract A body + no extra fields).
- `resolve.ts` (manager-owned, committed, fully implemented + tested):
  - `resolveModelForPurpose(config, purpose, storedValue)` → curated entry or
    null. Match order: alias `key` → legacy raw `model` id → purpose default
    (first entry) → null when list empty/config null.
  - `marginPctForModel(config, purpose, modelId)` → matched entry's margin,
    else purpose-default margin, else 0.
- `cache.ts` (**W1-B owns** — replaces the committed stub):
  - `getAiConfig(): Promise<AiConfig | null>` — reads `site_settings` key
    `ai_config` (JSON `{ fetchedAt: number, config: AiConfig }`), lazily
    refreshes from Contract A when older than `AI_CONFIG_MAX_AGE_MS` (15 min),
    stale-serving on any fetch failure; cache replaced only by a successful
    fetch. Missing env (`PM_ORIGIN`/`SITE_ID`/`CMS_AUTH_SECRET`) → serve
    cache or null, never throw. Copy the `model_catalog` pattern
    (`CMS/src/db/settings-store.ts:240-276` + TTL-in-caller
    `CMS/src/app/api/chat/models/route.ts`), but put the TTL logic inside
    `getAiConfig` so every caller gets freshness for free.

Only W1-B edits `cache.ts` and `settings-store.ts` (new key + get/set).
W1-C and wave-2 slices import from `@/lib/ai-config` and never edit it.

## Contract C — CMS metering (W1-C)

1. **Adapter**: `OpenRouterAi.chat` request body additionally sends
   `usage: { include: true }` (belt-and-braces; OpenRouter includes
   `usage.cost` by default now). File `CMS/src/lib/ports/ai.ts`.
2. **SSE**: `extractUsage` in `CMS/src/lib/chat/sse.ts` also reads
   `usage.cost` (USD number) → usage event + `OnUsage` arg gain
   `cost?: number` (`CMS/src/lib/chat/reframe.ts:166`). Absent upstream →
   undefined, never 0.
3. **Store**: new file `CMS/src/db/ai-usage-store.ts` (thin, uses
   `incrementCounter`/`getCounter` from `usage-counter-store.ts`):
   - keys: `ai:<YYYY-MM>:billable`, `ai:<YYYY-MM>:raw` (UTC month, integer
     nano-USD).
   - `recordAiUsage(costUsd: number, marginPct: number, now?: Date)` — bumps
     raw by `round(costUsd·1e9)` and billable by
     `round(costUsd·(1+marginPct/100)·1e9)`; no-op when costUsd ≤ 0. The
     nano/billable math lives as pure exported helpers in
     `CMS/src/lib/public-chat/core.ts` (next to `usageCostNanoUsd`) with
     tests.
   - `readMonthlyAiUsage(now?: Date)` → `{ month, billableNanoUsd,
     rawNanoUsd }`.
4. **Call sites metered** (margin via `getAiConfig()` +
   `marginPctForModel(config, purpose, modelId)`; config null → margin 0,
   still meter raw+billable equal):
   - admin assistant `api/chat/route.ts` — add an `onUsage` (purpose
     `assistant`).
   - guest chat `api/public-chat/route.ts` — purpose `chatAgent`; ALSO
     upgrade the per-agent daily `:cost` counter: when `usage.cost` is
     present, bump by the **billable** nano amount instead of the
     token×catalog estimate; keep the estimate as fallback when cost absent.
   - translate `api/translate/route.ts` — purpose `translate`; usage arrives
     on the SSE stream consumed by `collectStreamText` — extend it (or add a
     variant) to surface the final usage/cost.
   - describe-image (`lib/chat/describe-image.ts` + caller
     `api/assets/route.ts`) and generate-image (`lib/chat/generate-image.ts`
     + caller `lib/chat/tool-dispatch.ts`) — non-streaming: parse
     `json.usage.cost`, return it alongside the existing result, caller
     meters (purposes `imageDescribe` / `imageGenerate`).
   - Metering is fire-and-forget (`.catch(() => {})`) — never fail or delay
     the user-facing call.

## Contract D — CMS enforcement + credit chip (W2-D)

- `checkAiQuota(): Promise<{ ok: boolean; usedNanoUsd: number; quotaUsd:
  number | null }>` in `ai-usage-store.ts`: quota from
  `getAiConfig()?.quota.monthlyUsd`; null quota or no config → ok. Compare
  monthly billable vs quota.
- Every AI entry point (admin chat, guest chat, translate, describe, generate)
  checks BEFORE calling the model; refusal:
  - admin surfaces: HTTP 429 JSON `{ error: "monthly AI quota reached" }`
    (i18n on the client via existing admin i18n).
  - guest chat: HTTP 429 `{ error: <localized string> }` resolved server-side
    with `resolveLocalized` + the request's content locale (pattern:
    localized welcome messages in `lib/public-chat/core.ts:373-434`); the
    guest client script already renders `j.error` verbatim.
- Credit chip: `api/chat/credit/route.ts` rewritten to local counters →
  `{ credit: { usedUsd, quotaUsd, remainingUsd } | null }` (null when no
  quota configured). `lib/chat/credit.ts` OpenRouter parse helpers retire.
  Widget (`components/chat/chat-widget.tsx`) shows "used $X of $Y".
- New CMS route `GET /api/pm/ai-usage`, auth `Bearer CMS_AUTH_SECRET` →
  `{ month: "YYYY-MM", billableNanoUsd, rawNanoUsd, quotaUsd }` (W2-F polls
  this).

## Contract E — CMS cleanup (W2-E)

- Delete the user-key feature: `api/settings/openrouter-key/route.ts`,
  `components/settings/openrouter-key-manager.tsx`,
  `db/openrouter-key-store.ts`, the `openrouterKey` settings-nav entry +
  page, i18n namespace. Simplify `lib/settings/openrouter-key.ts` away; the
  4 key-resolution call sites (`lib/ports/ai.ts`, `api/chat/credit` if it
  still exists post-W2-D, `api/assets/route.ts`, `lib/chat/tool-dispatch.ts`)
  read `env.OPENROUTER_API_KEY` only.
- Pickers → curated aliases: chat-agent editor ModelPicker + the three Media
  settings managers now offer only curated entries for their purpose (label
  shown, alias `key` stored). Data source: new CMS route
  `GET /api/ai-config/aliases?purpose=<p>` (admin-gated thin read over
  `getAiConfig()`), so client components never parse the raw config. Legacy
  stored raw model ids keep working via `resolveModelForPurpose` (already
  matches legacy ids); server routes that persist model choices accept
  alias keys OR (for backward compat) previously-stored raw ids.
  - Wire shape (extended 2026-07-23): each alias is
    `{ key, label, model, inputPrice?, outputPrice?, inputModalities?,
    outputModalities?, contextLength? }`. The prices are CUSTOMER-facing
    USD-per-token rates — the OpenRouter catalog price already adjusted by
    the alias `marginPct` server-side (`projectAliasOptions` in
    `lib/ai-config/alias-options.ts`, joined via `lib/chat/catalog-loader.ts`).
    `marginPct` itself is still never projected to the browser. The join
    fields are optional: absent when the model isn't in the (possibly
    stale/empty) catalog cache. Curated pickers render these through the same
    rich `ModelPicker` UI as the free catalog (`aliasCatalog` maps alias →
    `CatalogModel` with the alias key as the entry id).
- Server-side resolution: everywhere a model id is read for an AI call
  (`chat_agent.model`, `image_model`, `image_gen_model`, `translate_model`,
  assistant request body), pass the stored value through
  `resolveModelForPurpose` first; fall back to today's `DEFAULT_*` consts
  when it returns null. The assistant's client-sent model must be validated
  against curated aliases (replacing the catalog check).

## Contract F — PM dashboards + circuit breakers (W2-F)

- `updateKey(provisioningKey, hash, { limit, limitReset }, fetchImpl?)` added
  to `ProjectManager/src/lib/openrouter/provision.ts` — PATCH
  `https://openrouter.ai/api/v1/keys/{hash}` with
  `{ limit, limit_reset: "monthly" }`.
- Circuit breaker: `circuitBreakerLimitUsd(quotaUsd) = quotaUsd == null ?
  null : ceil(quotaUsd * 2.5)` (pure helper + test). Applied: (a) at mint
  time (`sites/[id]/deploy/route.ts` passes the derived cap, plus
  `limit_reset: "monthly"` support in `mintKey`); (b) on quota PATCH
  (`sites/[id]/route.ts` → `updateKey` when a key hash exists); (c) a
  one-time "apply caps" admin action (button or script) PATCHing every site
  with a minted key.
- Dashboards (PM admin): per-site usage vs quota + fleet total vs pool +
  reconciliation. Data: poll each deployed site's
  `GET https://bizbeecms-cms-<slug>.<WORKERS_SUBDOMAIN>.workers.dev/api/pm/ai-usage`
  with `Bearer CMS_AUTH_SECRET` (Contract D shape). `WORKERS_SUBDOMAIN` = new
  PM wrangler var (default `vali-draganescu88`). Reconciliation: OpenRouter
  `GET /api/v1/keys/{hash}` via the provisioning key → compare its `usage`
  vs the site's reported raw. Poll on page load (no cron), tolerate
  unreachable sites (render "unreachable", keep going).
