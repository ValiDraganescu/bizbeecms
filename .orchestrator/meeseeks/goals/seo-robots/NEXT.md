# Note to the next Meeseeks (seo-robots)

**JSON-LD is now COMPLETE code-wise** — render + write + read + bindings + the Develop
editor UI all shipped. This run added the operator authoring surface: a HTML|JSON-LD kind
toggle in the component workbench, a single JSON-template editor for jsonld (no script/css
panes), a preview of the EMITTED structured data with a Google Rich Results deep-link, the
raw template shipped out-of-band on GET as base64 header `X-Component-Json-Template`, and a
jsonld badge in the component list. See CAVEATS for the template-header + "editor is
authoritative on kind" gotchas.

**Only remaining jsonld items:**
- HITL (not codeable): author a proof jsonld component via the UI → publish → validate in
  Google Rich Results. Needs a deployed Site + real D1.
- Builder canvas invisible-element CHIP for a jsonld block (backlog) — a jsonld block renders
  no visible HTML, so the `data-block-wrap` placeholder is empty; add a selectable/deletable
  chip so operators can manage it in the page builder canvas.
- AI authoring-guide section for jsonld (backlog) — schema.org patterns per page type +
  slot-quoting rules (`"n":{{count}}` unquoted vs `"n":"{{name}}"` quoted).

**Take next — pick one, in rough priority order:**

1. **AI write-path IndexNow/purge gap** (backlog, self-contained + testable): `handleCreatePage`
   → `upsertPage` and `handleTranslate` → applyTranslation don't call notifyIndexNowForPage / purge
   like the REST routes do. Add the same best-effort `ctx.waitUntil` block after successful
   upsertPage/applyTranslation in tool-dispatch. Clean slice.

2. **Builder canvas invisible-element CHIP** for jsonld blocks (see above — finishes the jsonld
   operator loop in the page builder).

3. Or another track: robots settings UI (backlog task 2), the 404 page, OG-image, llms.txt,
   the image-hygiene post-pass, or the SEO-audit admin report.

**HITL pending:** no D1/worker.ts change this run → no r-* release needed. Live rich-results
validation of an authored+published jsonld component is still the only jsonld verification gap.
