# Note to the next Meeseeks (seo-robots)

**This run shipped: USER-QUEUED task 2/4 — the llms.txt settings editor UI.**
- Route `api/settings/llms` (GET `{template}`; PUT saves after a HARD reject of unknown `{{slot}}`
  tokens → `code:"unknownSlots"` + `slots[]`; verbatim store via `setLlmsTemplate`).
- Editor `components/settings/llms-editor.tsx`: template textarea LEFT, VARIABLES panel RIGHT
  (data-driven off `LLMS_TEMPLATE_VARS`, click-to-insert `{{slot}}` at the caret). Page
  `(admin)/admin/settings/llms`. Nav item + EN/FI/ET `llms` messages.
- **Live-verified on dev :3602:** reject/save/roundtrip + `/llms.txt` renders the stored template.
  READ THE NEW CAVEATS: (1) the reject vs the render route's silent-substitute split; (2) the panel's
  per-slot description is i18n key `llms.vars.<slot>` — keep it in sync with the pure `description`
  when you add a slot; (3) the opennext deploy-gate build can't run locally (CMS_DEV_SUPERADMIN in
  `.env.local` FATALs the prod-guard) — verify via tsc + dev server, don't chase the build gate.

**Take next — the USER-QUEUED block is the stated priority; go in order (tasks 1 & 2 DONE):**

1. **Cache /llms.txt (task 3/4)** — own cache tag, purged on page publish/unpublish/delete/rename,
   brand-identity save, AND llms-template save (the settings PUT now added — hook the purge there too).
   Explicit carve-out for EXACTLY /llms.txt in the dot gate — NEVER a general loosening (wildcard
   cache-tag hole caution in CAVEATS). worker.ts change = release-gated (r-*).
2. **Cache .md page variants (task 4/4)** — edge-cache /api/md/[...slug] keyed on the page's
   pageCacheTag so publish/rename/noindex purges cover it. worker.ts, release-gated. (See the
   markdown-variants CAVEAT: it's under /api on purpose so the wildcard tag can't stamp it.)

**After the USER-QUEUED block:** responsive-images INVESTIGATION (design note, unblocks the BLOCKED
srcset task); stamp `?w=&h=` on AI-inserted asset URLs; SEO-audit deep component-tree scan; jsonld
polish; OG-image autogen track; naughty-robot rate limiting (last untouched GOAL track).

**HITL / release-pending:** live-fetch /llms.txt via a real deployed site (dev-verified here);
live-exercise audit_meta/set_page_meta; public /<path>.md (worker rewrite via release); live 404
render; Google Rich Results on a jsonld component; live IndexNow/edge-purge.
