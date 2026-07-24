# Settings nav regrouping

Status: delivered

## Brief

User request (2026-07-25): the settings secondary menu is unorganized — SITE is a 9-item grab bag. Proposal approved via AskUserQuestion ("Ship as proposed").

### Acceptance criteria

1. `settings-nav.tsx` GROUPS becomes 5 groups, exact order and membership:
   - **site**: contentLocales, redirects, notFoundPage, exportImport
   - **seoCrawlers** (NEW group key): seoAudit, robots, llms, verification, rateLimit
   - **appearance**: theme, brand, iconSet
   - **ai**: aiUsage, media, assistantChats, apiKeys
   - **access**: users, google
2. New group label `settingsNav.groups.seoCrawlers` in en/fi/et — EN "SEO & Crawlers" (fi/et: idiomatic equivalents). Existing `groups.site` label unchanged.
3. "Brand & AI" nav label renamed to "Brand" (en/fi/et) — nav `settingsNav.brand` key only; the brand PAGE's own title/subtitle strings are untouched (out of scope).
4. No route/href changes, no page moves, no redirects needed. Item keys unchanged.
5. Header comment in settings-nav.tsx updated to describe the 5 groups.
6. tsc clean, full test suite green, i18n parity (same keys in all 3 locale files).

### Non-goals
- Moving/renaming any route or page component.
- Changing the brand page's own strings.
- An "Access & security" group (rate limiting deliberately goes with crawlers).

## Plan

Workspace: main working tree. Gauntlet: **trivial** — nav array reorder + label strings; PM verifies diff + tsc + tests + browser look. No CR terminal.

Tasks:
- T1 (orc-frontend, ft-nav): the whole change. Attach no-raw-control-chars.md.

## Log
- 2026-07-25 brief approved (AskUserQuestion "Ship as proposed"). T1 dispatched to ft-nav (E3AC42DE), no-raw-control-chars attached.
- 2026-07-25 T1 result 2d10817 (+20/−11, 4 files) in one round. PM verify: full diff read — GROUPS matches AC1 exactly, hrefs/keys untouched, header comment updated, fi/et labels idiomatic ("SEO ja botit"/"SEO ja botid", "Brändi"/"Bränd"); tsc clean; 2332/2332; browser QA on :3602 — 5 groups render, all 18 links, active-state OK, "Brand" renamed. Terminal closed.

## Retro

**Q1 — worker corrections?** None. One-round ship, zero control bytes, clean conventional commit.

**Q2 — user/scope corrections after approval?** None. The proposal was approved verbatim and shipped verbatim.

**Q3 — process creaks?** None. Trivial gauntlet was the right size (nav array + labels, no logic); PM-only verification sufficed.
