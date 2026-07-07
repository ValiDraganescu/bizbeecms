# Note to the next Meeseeks (seo-robots)

**This run shipped: BUILDER CANVAS CHIP for invisible (jsonld) blocks.** A jsonld component renders
only a `display:none` placeholder → its `data-block-wrap` collapsed to zero height, unselectable on
the canvas. Fixed PREVIEW-ONLY in `preview-overlay.ts`: `injectInvisibleChips()` puts a visible
`◇ <name>` chip into any zero-area wrap at wire time; the existing hover/select/delete machinery then
just works. NEW CAVEAT: builder-only affordances go in the iframe overlay, never the render plan
(public=preview must stay byte-identical). Pure `isVisuallyEmptyRect` gate, 3 tests; suite 1898; tsc clean.

**No user-queued work left — pick the highest-value GOAL slice (ranked):**

1. **jsonld polish — remaining 2 of 3:** (a) List/ItemList per-row binding (the one binding case
   jsonld can't ride — see CAVEATS jsonld-bindings seam), (b) AI authoring-guide section (schema.org
   patterns per page type + slot-quoting rules `"n":{{count}}` unquoted vs `"n":"{{name}}"` quoted).
   The builder-chip item is now DONE.
2. **SEO-audit deep component-tree scan** — audit only scans raw `page.blocks`; links/images/alt
   authored INSIDE referenced component trees are missed. Needs the D1 component resolver (not pure) —
   decide: build the plan (heavy) vs a dep-light component-tree href/img extractor over
   `getComponentByName`. Feed into the existing `auditSeo` shape.
3. **Per-URL-locale branded 404** — release-gated: inject the request path as a header in worker.ts,
   read via next/headers + peelActiveLocale in not-found.tsx (a 404 is never edge-cached → safe).
4. **OG-image autogen track** — start with the tracer/decision spike (Browser Rendering; paid plan;
   screenshot one published page to R2 og/<pageId>.<locale>.png; skip in local dev).
5. **Naughty-robot rate limiting** — the last untouched GOAL track; needs worker.ts (release-gated r-*).
6. **AI "fix missing alt" path** (lower value) — audit_alt read tool + guide line so the AI can
   set_block_props alt for `auditSeo.missingAlt`.

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- Builder chip: live visual check (a jsonld block on a page + the running builder) — the chip should
  show as a dashed `◇ <name>` box on the canvas, hoverable/clickable/deletable like any block.
- AI generate_image: live round-trip stamps real dims (needs OpenRouter key + deployed origin).
- responsive images: live `/media/<key>?w=640` resized bytes + `<img srcset>` per DPR/viewport.
- `.md` variant caching; /llms.txt cached + purge; live 404 render; Google Rich Results on a jsonld
  component; live IndexNow/edge-purge.
