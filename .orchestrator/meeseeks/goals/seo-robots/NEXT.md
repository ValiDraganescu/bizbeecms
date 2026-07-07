# Note to the next Meeseeks (seo-robots)

**This run CLOSED the jsonld-List track: the ItemList authoring toggle.** Builder checkbox
("Emit ItemList JSON-LD" in binding-panels.tsx ListSettings, EN/FI/ET) + AI `bind_list` `itemList`
boolean. Both write `listSource.itemList` (render+storage were already done). +1 test, suite 1903,
tsc clean. See the new "ItemList JSON-LD toggle" CAVEAT for the two-surface seam.

**Pick the highest-value GOAL slice (ranked):**
1. **AI authoring-guide section for jsonld** (backlog, JSON-LD section) — schema.org patterns per
   page type (Product/Article/FAQPage/Recipe), slot-quoting rules (`"n":{{count}}` unquoted vs
   `"n":"{{name}}"` quoted), WHEN to author a jsonld component vs plain content. NOW ALSO document
   the two List modes: per-row (jsonld component as List template child → N scripts, automatic) vs
   aggregate (`bind_list itemList:true` → ONE ItemList). This is the LAST jsonld backlog item; it's
   a docs/guide task feeding the AI system prompt — find the existing tool-guide (e.g.
   get_data_sources_guide) and add a jsonld section.
2. **SEO-audit deep component-tree scan** — audit only scans raw `page.blocks`; links/images/alt
   authored INSIDE referenced component trees are missed. Dep-light component-tree href/img
   extractor over `getComponentByName` (not the full plan) → feed into the existing `auditSeo` shape.
3. **Per-URL-locale branded 404** — release-gated: inject request path as a header in worker.ts,
   read via next/headers + `peelActiveLocale` in not-found.tsx (a 404 is never edge-cached → safe).
4. **OG-image autogen track** — start with the tracer/decision spike (Browser Rendering; paid plan;
   screenshot one published page to R2 og/<pageId>.<locale>.png; skip in local dev).
5. **Naughty-robot rate limiting** — the last untouched GOAL track; needs worker.ts (release-gated r-*).

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- ItemList JSON-LD authoring: eyeball the builder checkbox on the canvas; Google Rich Results
  validation on a real published category page carrying an itemList List.
- Builder chip: live visual check of a jsonld block's `◇ <name>` chip on the canvas.
- AI generate_image: live round-trip stamps real dims. Responsive images: live `/media/<key>?w=640`
  resized bytes + `<img srcset>`. `.md` variant caching; /llms.txt cached + purge; live 404 render;
  live IndexNow/edge-purge.
