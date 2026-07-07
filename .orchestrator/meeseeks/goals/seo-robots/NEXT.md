# Note to the next Meeseeks (seo-robots)

**JSON-LD component kind — RENDER PATH is DONE (tracer).** A `component.kind`
('html'|'jsonld') + `draft_kind` (migration 0031) now exists. A jsonld component's
`html` column is a JSON TEMPLATE with `{{prop}}` slots; `planPage` funnels it onto
`plan.jsonLd` as an `application/ld+json` script (hidden placeholder in the flow, no
visible HTML). Pure `lib/render/jsonld-component.ts` (`escapeJsonForScript` — now the
SHARED escaper breadcrumb.ts imports too — `bindJsonLdSlots`, `buildJsonLdComponent`).
13 unit tests, `npm test` 1770/1770, tsc clean, migration applied local. See CAVEATS for
the string-level-binding + template-quote-omission gotchas.

**IMPORTANT: nothing WRITES kind yet.** The render path reads it, but no create/update
path sets it and there's no way to author a jsonld component. So the render tracer is
un-exercisable live until the authoring task lands.

**Take next — pick one, in rough priority order:**

1. **JSON-LD authoring surface** (finishes the JSON-LD track's core value):
   `create_component`/`update_component` (chat write-tools) + the Develop editor accept
   `kind:"jsonld"` and write `component.kind`/`draft_kind`. Publish copies `draft_kind→kind`,
   discard clears it — MIRROR the existing html/script/css draft columns (find where publish/
   discard copy those and add kind alongside). Builder canvas: a jsonld block renders an EMPTY
   `data-block-wrap` placeholder — show an invisible-element CHIP so operators can select/delete
   it. Ship ONE proof jsonld component authored → published → validated in Google Rich Results.
   (After this, the render tracer is finally exercisable end-to-end.)

2. **JSON-LD × bindings** (backlog): collection/`:param` bindings interpolate into a jsonld
   component so wildcard detail pages get per-URL structured data. The bind machinery hydrates
   `block.props` BEFORE the pure walk (hydrateBlockBindings in render-page.tsx) — a jsonld block
   reads the SAME `block.props`, so single-item binds likely already pass through; verify + add a
   unit test for the escaping through a bound value. (Do #1 first — can't test live otherwise.)

3. **Teach the AI the jsonld kind** (backlog): create/update tools validate the artifact parses
   as JSON with `@context`/`@type`, authoring-guide section, self-correcting errors naming the
   bad token. (Needs #1's tool plumbing.)

**Patterns just used (copy):** shared escaper lives in `jsonld-component.ts`; the SETTINGS-FEATURE
recipe (still stable) is in the prior NEXT if you pick a settings task instead. Component
draft/publish uses `draft_*` columns on the row (NOT a version table) — grep `hasDraft`/`draftHtml`
for the publish/discard copy sites when you add `draft_kind` handling.

**HITL pending (note, don't do):** the render tracer can't be validated live until authoring
lands. No worker.ts edit → no r-* release needed. Migration 0031 is applied --local ONLY;
prod D1 gets it at the next deploy (deployer runs migrations apply --remote).
