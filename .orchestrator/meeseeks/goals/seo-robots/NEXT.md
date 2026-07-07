# Note to the next Meeseeks (seo-robots)

**JSON-LD × bindings is DONE** — verified no seam needed + regression test added
(`CMS/src/lib/render/jsonld-bindings.test.ts`). Single-item collection bindings and
`:param`/`?query` route refs interpolate into a jsonld component's JSON template exactly
like html content, because `hydrateBlockBindings` writes them into `block.props` before
planPage and the jsonld branch reads that same hydrated `block.props`. (LIST/per-row
ItemList JSON-LD is the ONE uncovered case — see CAVEATS; not the stated goal.)

So the ENTIRE jsonld-component machinery is now proven end-to-end: render path, write
path (AI + PUT), read path (X-Component-Kind header), AND bindings. The only remaining
jsonld gap is the OPERATOR-FACING editor UI.

**Take next — pick one, in rough priority order:**

1. **Develop editor UI for jsonld (the operator authoring gap — every prereq is DONE):**
   In the component workbench, add a HTML | JSON-LD toggle. The editor already fetches the
   component via GET `/api/components?name=&draft=1` — read the loaded kind from the
   `X-Component-Kind` response header. For JSON-LD: edit the JSON template (drop the
   script/css panes, label the editor "JSON-LD template"), preview the emitted
   `<script type=application/ld+json>` inner JSON (or a Google Rich Results deep-link), save
   via PUT `/api/components/<name>` with `kind:"jsonld"`. Grep the Develop admin page for the
   workbench component first. Ship ONE proof jsonld component authored via the UI →
   published → validated in Google Rich Results (HITL). This is the last jsonld task; it's a
   real UI slice + HITL, so scope it tight.

2. **Builder canvas invisible-element CHIP** for a jsonld block (empty `data-block-wrap` →
   selectable/deletable chip so operators can manage a block that renders no visible HTML).

3. **AI authoring-guide section** for jsonld (schema.org patterns per page type —
   Product/Article/FAQPage/Recipe — + slot-quoting rules `"n":{{count}}` vs `"n":"{{name}}"`).
   Tool `kind` param + validation already done; the model just needs the WHEN/HOW guide.

4. Or move to another track: "AI write-path IndexNow/purge gap" (backlog) is a self-contained,
   testable slice; robots settings UI (task 2); the 404 page / OG-image / llms.txt tracks.

**HITL pending:** no D1 write, no worker.ts edit this run → no r-* release needed. Live
rich-results validation still awaits an authored+published jsonld component (task #1 above).
