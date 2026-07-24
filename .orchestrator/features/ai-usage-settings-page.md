# Centralized AI credits + usage view (CMS settings)

Status: delivered

## Brief

User request (2026-07-24): "in the settings panel of the CMS we need a centralized way of viewing the allocated AI credits and the daily and total usage." Today the only surface is the chat-widget credit chip (used/quota/remaining, monthly). AskUserQuestion decisions: total = **month-to-date vs quota + all-time**; daily = **last-30-days chart/list** (new counters, accrue from this release); breakdown = **per-purpose** (assistant, chatAgent, translate, imageDescribe, imageGenerate).

### Acceptance criteria

1. **New settings page** `/admin/settings/ai-usage` under the AI group in `settings-nav.tsx` (key `aiUsage`), admin-gated, strings in en/fi/et.
2. **Credits hero**: allocated monthly credits (quota from `getAiConfig()`), month-to-date **billable** used, remaining — the exact numbers `checkAiQuota` enforces on (same source, can never disagree). No quota configured / config unreachable → page still renders usage with a clear "no quota allocated" state (never blank, never 500).
3. **All-time total**: sum of ALL `ai:<YYYY-MM>:billable` monthly counters (works retroactively for months already metered). New store helper reads by key prefix/suffix — no schema change, `usage_counter` only.
4. **Daily counters**: `meterAiCall` additionally bumps per-day per-purpose billable keys (UTC day bucket, e.g. `ai:d:<YYYY-MM-DD>:<purpose>`), same atomic-increment, same swallow-everything guarantee — metering must never fail or delay an AI call. Monthly raw/billable keys unchanged (PM contract untouched). Daily data starts accruing at release; page states that history begins then.
5. **Daily view**: last 30 days as a simple bar chart/list (billable per day, today highlighted) + today's spend figure.
6. **Per-purpose breakdown**: current month's spend per purpose (from the daily per-purpose keys aggregated, or month-purpose keys — implementer's call, but ONE new key scheme, documented in the store header).
7. **Route**: `GET /api/ai-usage/summary` (admin, REST-only) → `{ quotaUsd|null, month: {month, billableUsd}, allTimeUsd, days: [{day, usd}], purposes: [{purpose, usd}] }`. Degrades per-section on read failure, never 500s the page. Client renders from this one call.
8. Pure math/aggregation helpers dep-free + `node --test`ed; no changes to enforcement (`checkAiQuota`), Contract A–F wire shapes, or PM.

### Non-goals
- PM-side dashboards (exist already, Contract F).
- Raw (provider) cost display — settings page is operator-facing, billable only.
- Backfilling daily/purpose history for pre-release months.
- Editing the quota from the CMS (PM owns allocation).

## Plan

Workspace: main working tree (dev server :3601/:3602 iteration). Gauntlet: **standard** — implement → fresh-terminal code review → PM browser QA. The touched money path (`meterAiCall`) is additive-only (new daily/purpose keys next to the existing monthly bumps) and fire-and-forget, so no enforcement risk; CR focuses on the meter addition + aggregation math + never-500 route.

Tasks:
- T1 (orc-frontend, ft-ai-usage): store keys + aggregation helpers + summary route + settings page/nav + i18n + tests. Attach `.orchestrator/instructions/no-raw-control-chars.md`.
- CR (orc-review, fresh terminal): meter-path safety (cannot fail/delay AI calls), key-scheme growth sanity, aggregation math, route degradation, i18n completeness.

## Log
- 2026-07-24 ~21:25 brief approved (3 AskUserQuestion scope answers + approve). T1 dispatched to ft-ai-usage (397EAF2B), no-raw-control-chars attached.
- 2026-07-24 21:37 T1 result 457d8a3 (+718/-6, no Bin files). PM verify: full diff read — strict key regexes keep :raw/chat/daily keys out of totals, D1 ~100-param cap worked around with month-prefix LIKE + strict pure-side filter; tsc clean; 2332/2332. CR dispatched to cr-ai-usage (633FF929).
- 2026-07-24 21:4x PM browser QA (:3602): page renders in AI nav group ("Credits & usage"); no-quota state OK; summary wire shape exact per AC7 (30 days oldest-first UTC, 5 purposes catalog order, quotaUsd null); zero console errors; seeded quota.monthlyUsd=10 into local ai_config cache → hero showed Allocated $10.00 / Used $0.27 / Remaining $9.73, then reverted quota to null.

## Retro

**Q1 — worker corrections?** None. One-round ship from ft-ai-usage; the no-raw-control-chars attachment held (0 control bytes, first-attempt). Only PM slip: a typo'd terminal UUID on first dispatch (8B9C→9B9C) — send failed loudly, resent; no instruction needed.

**Q2 — user/scope corrections after approval?** None. The three AskUserQuestion scope answers (month+all-time, 30-day chart, per-purpose) held unchanged.

**Q3 — process creaks?** None. Standard gauntlet fit the additive blast radius. CR's one open note — partial accrual if one of the three parallel increments fails — is display-only and consistent with the fire-and-forget metering doctrine; accepted, not a defect. Reusable QA trick logged: seed `site_settings.ai_config` quota in the local D1 sqlite to exercise quota-present UI states, then revert.

- 2026-07-24 21:40 CR verdict: SHIP (meter swallow-all holds, aggregation/edge/injection/degradation/i18n verified, contract untouched, 2332/2332). Terminals closed.
