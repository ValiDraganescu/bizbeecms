# Note to the next Meeseeks (seo-robots)

**This run shipped: the AI bulk-meta assistant tools** (`audit_meta` + `set_page_meta`).
- Pure `lib/chat/meta-tools.ts` (8 tests): `validateSetPageMeta` + `mergePageMeta`. `audit_meta`
  (no args) returns auditSeo's missingMeta page×locale gaps; `set_page_meta` MERGES a per-locale
  metaTitle/metaDescription onto ONE page (addressed by slug) via `upsertPageMeta` + the LIGHT AI
  hook (purge pageCacheTag + IndexNow, like create_page). Wired into tool-dispatch, tool-scopes
  (pages + page-builder), and the pages context prompt.
- READ THE NEW CAVEAT: `metaImage` is NOT preserve-when-absent in upsertPageMeta — mergePageMeta
  carries the existing metaImage forward so a meta edit can't blank the OG image. Meta-only write
  can't move URLs / flip noindex → no rename/noindex pre-capture needed (that's why the light hook
  is right). No worker.ts change → ships on next normal CMS build.

**Take next — pick one, rough priority:**

1. **Responsive-images INVESTIGATION** (design note, not code) — Cloudflare Images API upload-time
   variants vs zone Image Resizing (custom-domain only; workers.dev can't) vs in-Worker (no native
   codecs — likely dead end). Deliverable = chosen path + constraints to JOURNAL/CAVEATS + filed
   impl tasks. Unblocks the BLOCKED srcset/WebP task. Dims already ride URLs as `?w=&h=`.

2. **Stamp `?w=&h=` dims on AI-inserted asset URLs** (list_assets / generate_image responses) via
   `withAssetDims`, so AI-authored pages get the CLS aspect-ratio box too (today only ImagePicker
   stamps dims). Authoring-time only, zero render cost. Pairs with the AI tooling just shipped.

3. **AI "fix missing alt" follow-up** (filed this run) — audit_alt read tool over auditSeo.missingAlt
   + a guide line so the AI knows to set_block_props the alt. Lower value (alt is per-image).

4. **SEO-audit deep component-tree scan** — extend the audit to links/images/alt authored INSIDE
   referenced component trees (needs the D1 component resolver; see the design-fork BACKLOG TODO).

5. **NEW USER-QUEUED (top of BACKLOG): editable llms.txt template + settings UI + caching for
   llms.txt and .md variants** — 4 tasks a curator added this session. The template MUST reuse the
   component `{{slot}}` binding convention (jsonld-component.ts string-level bind), not a new format.

**jsonld polish (lower):** builder-canvas invisible-element CHIP; AI authoring-guide section for
jsonld; per-row/ItemList JSON-LD for List blocks.

**OG-image autogen track** (4 BACKLOG tasks) — starts with a Browser Rendering tracer/decision spike.

**Naughty-robot rate limiting** (2 tasks, needs worker.ts + release) — last untouched GOAL track.

**HITL / release-pending:** live-exercise audit_meta/set_page_meta in a chat session (needs live D1 +
admin session); live-render the SEO-audit admin page; live Lighthouse/CWV; live upload dims persist;
public `/<path>.md` fetch (worker rewrite via release); live 404 render; live Google Rich Results
validation of a jsonld component; live IndexNow/edge-purge.
