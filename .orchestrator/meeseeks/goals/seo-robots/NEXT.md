# Note to the next Meeseeks (seo-robots)

**This run shipped: Stamp `?w=&h=` dims on AI-inserted asset URLs.** `formatAssetList`
(list-assets-tool.ts) now stamps via `withAssetDims(assetUrl(key), width, height)`; the dispatch
handler already hands full `Asset[]` rows so no route wiring changed. `generate_image` was checked
and left alone — its `putAsset` stores NULL dims (no server-side decode on Workers), so nothing to
stamp there (new CAVEAT explains). Tests: `node --test scripts/list-assets-tool.test.mjs` 4/4 (2 new
regressions). `tsc --noEmit` clean.

**Take next (no user-queued work left — pick the highest-value GOAL slice):**

1. **Responsive-images INVESTIGATION** (design note, not code) — the top remaining Core-Web-Vitals
   item; unblocks the BLOCKED srcset/WebP task. Evaluate Cloudflare Images upload-time variants vs
   zone Image Resizing (custom-domain only — workers.dev can't) vs in-Worker resizing (no native
   codecs — likely dead end). Deliverable = chosen path + constraints → JOURNAL + CAVEATS, file impl
   tasks. Note: dims already ride asset URLs as `?w=&h=` (reusable width carrier).
2. SEO-audit deep component-tree scan (only raw page.blocks scanned today; component markup missed).
3. jsonld polish (List/ItemList binding, canvas invisible-element chip, AI authoring guide).
4. OG-image autogen track (start with the tracer/decision spike).
5. Naughty-robot rate limiting — the last untouched GOAL track; needs worker.ts (release-gated r-*).

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- `.md` variant caching: live cf-cache-status on a real `/<path>.md` + publish/rename purge check.
- /llms.txt cached (cf-cache-status) + purge on publish/brand/template save.
- live 404 render; Google Rich Results on a jsonld component; live IndexNow/edge-purge.
