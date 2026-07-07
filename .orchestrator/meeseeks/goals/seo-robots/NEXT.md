# Note to the next Meeseeks (seo-robots)

**This run shipped: USER-QUEUED task 1/4 — the editable llms.txt template (pure + wired).**
- New pure `lib/render/llms-template.ts` (7 tests): `renderLlmsTemplate` (substitution via the
  SHARED `SLOT_RE` from plan-tree.ts — SAME `{{slot}}`/`{{ t slot }}` convention as components,
  per the user requirement), `unknownSlots` (self-correcting validation naming bad tokens),
  `LLMS_TEMPLATE_VARS` (single source of truth: slot + description + example — feeds BOTH the
  substitution allowlist AND the next task's UI side panel). Slots: brandName, tagline, origin,
  defaultLocale, locales, pageTree.
- Store: `getLlmsTemplate`/`setLlmsTemplate` (key `llms_template`, VERBATIM text). Route `/llms.txt`
  renders the stored template when set, else auto output. `{{pageTree}}` = new exported
  `buildLlmsPageList` (llms-txt.ts) = the exact auto "## Pages" list.
- READ THE NEW CAVEAT: validation split — the ROUTE substitutes unknown slots to "" (never 500s
  the public file); the on-save HARD reject via `unknownSlots` is the SETTINGS UI's job (next task).
  Template still no-store (caching is task 3, separate). No worker.ts change → ships on next build.

**Take next — the USER-QUEUED block is the stated priority; go in order:**

1. **llms.txt settings editor UI (task 2/4)** — admin settings page: the template editor + a SIDE
   PANEL to the RIGHT listing `LLMS_TEMPLATE_VARS` (name + description + example, click-to-insert
   preferred — the var list is ALREADY exported for you). REST GET/PUT mirroring the robots.txt
   settings pattern, but the PUT does a HARD reject on `unknownSlots` (stable error naming the bad
   token — like the redirect admin, NOT robots' silent-normalize). Localized EN/FI/ET.
2. **Cache /llms.txt (task 3/4)** — own cache tag, purged on page publish/unpublish/delete/rename,
   brand-identity save, AND llms-template save. Explicit carve-out for EXACTLY /llms.txt in the dot
   gate — never a general loosening (wildcard cache-tag hole caution in CAVEATS). worker.ts change =
   release-gated (r-*).
3. **Cache .md page variants (task 4/4)** — edge-cache /api/md/[...slug] keyed on the page's
   pageCacheTag so publish/rename/noindex purges cover it. worker.ts, release-gated.

**After the USER-QUEUED block:** responsive-images INVESTIGATION (design note, unblocks the BLOCKED
srcset task); stamp `?w=&h=` on AI-inserted asset URLs; SEO-audit deep component-tree scan; jsonld
polish; OG-image autogen track; naughty-robot rate limiting (last untouched GOAL track).

**HITL / release-pending:** live-fetch /llms.txt with a stored template (needs live D1 + a template);
live-exercise audit_meta/set_page_meta; SEO-audit admin page; public /<path>.md (worker rewrite via
release); live 404 render; Google Rich Results on a jsonld component; live IndexNow/edge-purge.
