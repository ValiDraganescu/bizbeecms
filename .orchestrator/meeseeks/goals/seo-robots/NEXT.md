# Note to the next Meeseeks (seo-robots)

**This run shipped: List → schema.org ItemList JSON-LD (user-queued top task, backlog task 1).**
The RENDER machinery for the last binding case jsonld couldn't ride. KEY DISCOVERY: per-row
Product/Article JSON-LD ALREADY worked via composition (a jsonld component as a List template child
→ planList stamps per row → jsonld branch fires per row → N scripts). The real gap was the AGGREGATE
`ItemList`: opt-in `listSource.itemList:true` → `emitItemList` closure (tree.ts) collects each row's
bound object via shared `bindJsonLdObject` and `buildItemListJsonLd` pushes ONE ItemList; planList
drops the handled jsonld children from visible stamping (no double-emit). 4 tests, suite 1902, tsc
clean. See the new "List × JSON-LD" CAVEAT for the full seam.

**Directly next (the follow-up this run FILED — small, high-value):**
- **ItemList authoring toggle** (backlog, JSON-LD section): render+storage are DONE; add the KNOB.
  (a) List settings panel checkbox "Emit ItemList JSON-LD" → writes `listSource.itemList` (mirror the
  `autoscroll` checkbox in `binding-panels.tsx` ListSettings `layout` reducer), localized EN/FI/ET.
  (b) AI: the create-list / update-list tool builds `listSource` in `tool-dispatch.ts` (~line 1366)
  — add `itemList` there so the AI can turn it on. This closes the whole jsonld List track.

**Then pick the highest-value GOAL slice (ranked):**
1. **AI authoring-guide section for jsonld** (backlog, JSON-LD section) — schema.org patterns per
   page type (Product/Article/FAQPage/Recipe), slot-quoting rules (`"n":{{count}}` unquoted vs
   `"n":"{{name}}"` quoted), WHEN to author a jsonld component vs plain content. Now ALSO document
   the two List modes (per-row via template child; aggregate via itemList).
2. **SEO-audit deep component-tree scan** — audit only scans raw `page.blocks`; links/images/alt
   authored INSIDE referenced component trees are missed. Dep-light component-tree href/img
   extractor over `getComponentByName` (not the full plan) → feed into the existing `auditSeo` shape.
3. **Per-URL-locale branded 404** — release-gated: inject request path as a header in worker.ts,
   read via next/headers + `peelActiveLocale` in not-found.tsx (a 404 is never edge-cached → safe).
4. **OG-image autogen track** — start with the tracer/decision spike (Browser Rendering; paid plan;
   screenshot one published page to R2 og/<pageId>.<locale>.png; skip in local dev).
5. **Naughty-robot rate limiting** — the last untouched GOAL track; needs worker.ts (release-gated r-*).

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- ItemList JSON-LD: Google Rich Results validation on a real published category page carrying an
  itemList List (once the authoring toggle lands and a site is deployed).
- Builder chip: live visual check of a jsonld block's `◇ <name>` chip on the canvas.
- AI generate_image: live round-trip stamps real dims. Responsive images: live `/media/<key>?w=640`
  resized bytes + `<img srcset>`. `.md` variant caching; /llms.txt cached + purge; live 404 render;
  live IndexNow/edge-purge.
