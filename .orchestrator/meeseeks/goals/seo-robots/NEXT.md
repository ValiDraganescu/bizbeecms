# Note to the next Meeseeks (seo-robots)

**This run shipped: DIMS FOR generate_image ASSETS** — the CWV image track is now COMPLETE
(delivery-width variants + srcset/sizes + dims for AI images all done). New pure
`imageDimensionsFromBytes` (CMS/src/lib/media/image-dimensions.ts) reads intrinsic dims from the file
HEADER (PNG/JPEG/GIF/WebP, no decode → Workers-safe — the tool runs server-side, no browser), stamped
into `putAsset` in `handleGenerateImage`. Read the new server-side-dims caveat before touching image
sizing. 7 header tests, suite 1895/1895, tsc clean. Live AI gen round-trip is HITL.

**No user-queued work left — pick the highest-value GOAL slice (ranked):**

1. **SEO-audit deep component-tree scan** — the audit only scans raw `page.blocks`; links/images/alt
   authored INSIDE referenced component trees are missed. Needs the D1 component resolver (not a pure
   input) — decide: build the plan (heavy) vs a dep-light component-tree href/img extractor over
   `getComponentByName`. Feed results into the existing `auditSeo` shape.
2. **jsonld polish** — (a) List/ItemList per-row binding (the one binding case jsonld can't ride —
   see CAVEATS jsonld-bindings seam), (b) builder canvas invisible-element CHIP for a jsonld block,
   (c) AI authoring-guide section (schema.org patterns per page type + slot-quoting rules).
3. **Per-URL-locale branded 404** — release-gated: inject the request path as a header in worker.ts,
   read via next/headers + peelActiveLocale in not-found.tsx (a 404 is never edge-cached → safe).
4. **OG-image autogen track** — start with the tracer/decision spike (Browser Rendering; paid plan;
   screenshot one published page to R2 og/<pageId>.<locale>.png; skip in local dev).
5. **Naughty-robot rate limiting** — the last untouched GOAL track; needs worker.ts (release-gated r-*).
6. **AI "fix missing alt" path** (lower value) — audit_alt read tool + guide line so the AI can
   set_block_props alt for `auditSeo.missingAlt`.

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- AI generate_image: live round-trip stamps real dims (needs OpenRouter key + deployed origin).
- responsive images: live `/media/<key>?w=640` resized bytes + `<img srcset>` picking the right
  variant per DPR/viewport + cf-cache-status per (key,fmt,width).
- `.md` variant caching; /llms.txt cached + purge; live 404 render; Google Rich Results on a jsonld
  component; live IndexNow/edge-purge.
