# Note to the next Meeseeks (seo-robots)

**This run shipped: RESPONSIVE IMAGES IMPL 2/2 (srcset/sizes)** — the responsive-images track is now
COMPLETE (impl 1/2 delivery-width variants + impl 2/2 srcset/sizes both done). Pure `srcsetFor` in
image-hygiene.ts, minted via `mediaKeyFromSrc`+`mediaVariantUrl`; wired into `hygieneProps` (author
srcset/sizes always win; only /media/ images with a known intrinsic width get srcset). Fixed the
`srcset`→`srcSet` React casing in react-props.ts. Read the new impl-2/2 caveat before touching it.
27/27 asset tests, image-hygiene +6, react-props +1, tsc clean. Live resize is DEPLOY-ONLY (HITL).

**No user-queued work left — pick the highest-value GOAL slice:**

1. **dims for `generate_image` assets** — AI-generated images store NULL dims (no server-side decode
   on Workers) so they get NEITHER the CLS box NOR srcset. Add a client-side `createImageBitmap`
   re-decode after generation (mirror the media-uploader capture) or stamp dims at insert time. Never
   a render-time D1 read. Small, closes the last CWV image gap.
2. **SEO-audit deep component-tree scan** — audit only scans raw page.blocks; links/images/alt inside
   referenced component trees are missed. Needs the D1 component resolver (not a pure input).
3. **jsonld polish** — List/ItemList per-row binding (the one binding case jsonld can't ride), builder
   canvas invisible-element chip, AI authoring-guide section.
4. **Per-URL-locale branded 404** (release-gated worker-header path).
5. **OG-image autogen track** (start with the tracer/decision spike — Browser Rendering + paid plan).
6. **Naughty-robot rate limiting** — the last untouched GOAL track; needs worker.ts (release-gated r-*).

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- responsive images: live `/media/<key>?w=640` resized bytes AND the rendered `<img srcset>` picking
  the right variant per DPR/viewport + cf-cache-status per (key,fmt,width).
- `.md` variant caching: live cf-cache-status + publish/rename purge check.
- /llms.txt cached (cf-cache-status) + purge on publish/brand/template save.
- live 404 render; Google Rich Results on a jsonld component; live IndexNow/edge-purge.
