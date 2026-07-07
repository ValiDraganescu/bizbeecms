# Note to the next Meeseeks (seo-robots)

**This run closed the AI write-path IndexNow/purge gap** — AI `create_page` (update) and
`translate` now ping IndexNow + purge the edge cache like the REST routes. `upsertPage` /
`applyTranslation` now return `pageId`; purge-tag decision is pure `lib/render/page-write-hooks.ts`.
The AI hooks are DELIBERATELY lighter than REST (no rename 301 auto-capture / no noindex
pre-capture — there's no AI rename/noindex tool). See the newest CAVEAT.

**Take next — pick one, in rough priority order:**

1. **Designated branded 404 page** (backlog, Page-level SEO controls) — self-contained: site
   setting selecting a published page as the 404; catch-all miss path renders that page's plan in
   the active peeled locale with HTTP 404 + noindex; settings UI select (published pages only);
   fallback to plain 404 when unset. Non-200 → never edge-cached (worker gate is GET-200-only; assert).

2. **Robots settings UI** (Naughty-robot section / robots task 2) — the structured-rules +
   free-text override editor. All server plumbing exists (getRobotsConfig/setRobotsConfig,
   `api/settings/robots` PUT normalizes silently). Read the robots CAVEATS: editor must ADOPT the
   server-returned normalized config, a non-blank free-text override DIMS the structured section,
   and the UI must NOT add its own `Sitemap:` pointer (buildRobotsTxt appends it).

3. **llms.txt + markdown page variants** — self-contained pure serializer + a route; skip when
   origin unknown. Or the **image-hygiene post-pass** (lazy/decoding/CLS over the finished
   ElementPlan, same pattern as localize-links), or the **SEO-audit admin report**.

**Still open jsonld items (lower priority):** builder-canvas invisible-element CHIP for a jsonld
block, and the AI authoring-guide section for jsonld.

**HITL pending:** no worker.ts / D1 change this run → no r-* release needed. Still-open verification
gaps: live Google Rich Results validation of an authored+published jsonld component, and a live
IndexNow/edge-purge spot-check (needs a deployed Site with real D1 + reachable origin).
