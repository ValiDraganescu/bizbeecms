# AI cost tracking, quotas, and curated models

Design doc — agreed 2026-07-23. Replaces the "OpenRouter key limit = the quota"
model with soft quotas metered in the CMS, a PM-owned credit pool, and
PM-curated model lists with per-alias margins.

## Why change

The current system uses the minted OpenRouter key's `limit` as the customer
quota. Review findings (2026-07-23):

- `mintKey` never sends `limit_reset`, so the "monthly" limit is actually a
  **lifetime** cap on the key.
- Editing a Site's quota in PM only updates the PM DB. There is no PATCH path
  to OpenRouter — the live key keeps its original limit forever. The only
  workaround (delete key + redeploy) mints a fresh key, which also **resets the
  month's usage to $0** (usage is per-key at OpenRouter).
- The OpenRouter limit is denominated in raw provider dollars, so a margin
  ("charge cost + 30%") is inexpressible at that layer.
- Cost display is split across two disconnected systems in different
  currencies: the assistant widget chip shows actual raw key spend (OpenRouter
  `/api/v1/key`), while chat-agent analytics shows estimated cost (tokens ×
  catalog price) for guest chat only.

## Key enabler

OpenRouter now includes **actual cost** in every response automatically:
`usage.cost` (USD charged) arrives in the final SSE chunk of streaming
responses and in the body of non-streaming ones. No parameters needed, no
catalog-price estimation, and it covers per-image pricing that token math
cannot. Metering is therefore billing-grade truth, recorded at call time.

## Decisions (locked)

1. **Customer-supplied OpenRouter keys are removed.** The CMS-local user key
   feature (Settings → OpenRouter key) is deleted; the minted key is the only
   key. Rationale: it fights the curated-model + pool model.
2. **Margin is per alias** (each curated model entry carries its own margin %).
3. **Site quotas must not oversell the pool.** PM validates that the sum of
   site quotas ≤ pool. The pool is monitoring + a safety net against public
   guest-agent abuse, not an enforcement layer.
4. **Per-site model pickers are constrained to curated aliases.** The existing
   CMS Media/Translation settings pages and the chat-agent editor's ModelPicker
   stop showing the raw OpenRouter catalog and show only curated aliases.

## Architecture

### PM: curated model config

PM owns a per-purpose curated model list. Purposes: `chatAgent` (guest chat
agents), `assistant` (CMS admin assistant), `imageDescribe`, `imageGenerate`,
`translate`. Each entry:

```jsonc
{
  "key": "fast-chat",          // stable id the CMS stores; never renamed
  "label": "Fast chat",        // customer-facing alias, freely renamable
  "model": "openai/gpt-4o-mini", // OpenRouter id; swappable without customer impact
  "marginPct": 30                // per-alias margin (decision 2)
}
```

- The alias `key` is what Sites persist (agent model, media settings). Swapping
  the underlying `model` or relabeling never touches Site data — the alias is
  the product, the model id is an implementation detail. Operators hand-pick
  models per purpose because task-fit is hard; customers never see raw ids.
- Each purpose list has an ordered default (first entry) used when a Site
  references a removed/unknown alias.
- PM admin UI: one curation page (list per purpose, add/remove/reorder, edit
  label/model/margin).

### Config distribution: pull + cache, not deploy-time env

The CMS fetches the curated config from a PM endpoint and caches it in its D1
with a TTL (same pattern as the existing model-catalog cache). Curation changes
propagate in minutes with **no redeploys**. Auth: the existing PM↔CMS shared
secret channel. Serving from cache on PM outage; the cache is only ever
replaced by a successful fetch.

### CMS: metering (source of truth for billable spend)

Every AI call path meters the actual `usage.cost` from the response:

- streaming chat (admin assistant + guest chat): extend the reframe `usage`
  event / `OnUsage` type with `cost`, parsed from the final SSE usage chunk;
- non-streaming calls (`describe-image`, `generate-image`, translate): read
  `usage.cost` from the response JSON.

Each call accrues, atomically via the existing `usage_counter` store (integer
nano-USD):

- `ai:<YYYY-MM>:billable` — monthly billable = `cost × (1 + marginPct/100)`.
  THE quota meter. Month key rollover = automatic monthly reset, no jobs.
- `ai:<YYYY-MM>:raw` — monthly raw cost, for PM reconciliation vs OpenRouter.
- the existing per-agent daily `:cost` counters stay as the analytics
  breakdown, upgraded from catalog-price estimates to actual billable cost.

### CMS: enforcement (soft quota)

- The Site's monthly quota (customer USD) is set by PM and delivered with the
  curated config (same fetch, same cache).
- Every AI route checks `billable ≥ quota` **before** calling the model and
  refuses with a friendly, localized "monthly AI quota reached" error (guest
  chat included). A call already in flight may overshoot by one turn — accepted.
- Enforcement never depends on PM being reachable mid-request: quota + config
  come from the local D1 cache.
- The assistant widget credit chip switches from OpenRouter `/api/v1/key` to
  the local counters: "used $X of $Y" in customer dollars — finally the same
  currency as the analytics page.

### OpenRouter keys: circuit breakers, not meters

Per-site minted keys remain, but their OpenRouter limit becomes a generous
hard cap (2–3× the site's monthly quota in raw dollars) with
`limit_reset: "monthly"`. Purpose: blast-radius containment if soft
enforcement is bypassed (bug, compromise, abuse of public agents). Never shown
to customers, never the billing meter. PM PATCHes the cap when a quota changes
(add a `updateKey` call to `provision.ts` alongside mint/delete).

### PM: dashboards, pool, reconciliation

- **Pool**: a configured total monthly credit (PM setting). Site quota create/
  edit validates `sum(site quotas) ≤ pool` (decision 3, no oversell).
- **Per-site usage**: PM polls each CMS's usage endpoint (billable + raw,
  current month) and shows per-site usage vs quota, fleet total vs pool.
- **Reconciliation**: PM also reads each key's raw spend from the OpenRouter
  provisioning API (by stored key hash) and surfaces drift between metered raw
  and OpenRouter-reported raw — the tripwire for metering bugs.
- Alerting when a site nears its quota or the fleet nears the pool is a PM
  concern (out of scope for the first slice).

## What gets removed

- CMS Settings → OpenRouter key page (`openrouter-key-manager.tsx`), its API
  route (`api/settings/openrouter-key`), `db/openrouter-key-store.ts`,
  `lib/settings/openrouter-key.ts` precedence logic; `getAi()` reads only the
  injected env key. (Decision 1.)
- The raw-catalog ModelPickers on customer-facing surfaces (replaced by alias
  pickers fed from the cached curated config). The full-catalog picker survives
  only inside PM's curation page.
- The credit chip's OpenRouter `/api/v1/key` dependency (`api/chat/credit`
  becomes a local-counter read; `lib/chat/credit.ts` parse helpers retire).

## Migration

1. PM: curation config + endpoint + pool setting + quota validation; seed the
   curated lists from today's de-facto defaults (gpt-4o-mini, GLM 4.6V, Nano
   Banana, etc.).
2. CMS: config fetch + D1 cache; alias resolution layer (`alias key → model
   id + margin`) with per-purpose defaults.
3. CMS: metering (`usage.cost` through reframe + non-streaming paths, monthly
   counters) — ship metering before enforcement to build confidence against
   OpenRouter reconciliation.
4. CMS: enforcement + new credit chip + analytics upgraded to billable.
5. CMS: remove the user-key feature; constrain pickers to aliases (existing
   stored model ids map to aliases where possible, else purpose default).
6. PM: dashboards (per-site, fleet, reconciliation); one-time PATCH of all
   existing minted keys to circuit-breaker caps + `limit_reset: "monthly"`.

Existing per-agent analytics counters keep their history (estimates); the
switchover date is visible as the point where analytics matches OpenRouter.

## Out of scope

- Customer-facing billing/invoicing (the quota is prepaid allotment, not
  metered invoicing).
- Per-conversation or per-visitor quotas (existing per-agent limits already
  cover abuse shaping).
- Automatic model failover chains per alias (one model per alias for now).
