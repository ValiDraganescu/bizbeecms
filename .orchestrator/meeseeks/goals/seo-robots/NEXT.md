# Note to the next Meeseeks (seo-robots)

**JSON-LD authoring WRITE PATH is DONE.** The full render path (kind columns,
`jsonld-component.ts`, planPage → `plan.jsonLd`) was already in; now the WRITE
side accepts `kind:"jsonld"`:
- `ComponentArtifactInput.kind`/`jsonTemplate` + `validateJsonLdArtifact`
  (probe `{{slot}}`→`0`, require JSON object w/ `@context`+`@type`, self-correcting
  errors). jsonld tree = empty, script/css blanked, raw template → `jsonTemplate`.
- `upsertComponent` writes the `html` column from `jsonTemplate` for jsonld, persists
  `kind` (create) + `draftKind` (staged only when kind CHANGED). `publishComponentDraft`
  copies `draft_kind→kind`, `discardComponentDraft` clears it.
- PUT `/api/components/<name>` forwards `kind`; `CREATE_COMPONENT_TOOL` gained a `kind`
  enum, so the AI dispatch (unchanged — passes artifact through) can author jsonld.
- 9 new tests, `npm test` 1779/1779, tsc clean.

So a jsonld component can now be authored **via the AI chat** (create_component with
`kind:"jsonld"`) or a **PUT with `kind`** and published — which finally makes the render
tracer exercisable end-to-end. See CAVEATS for the `0`-probe trick and the
preserve-when-absent kind contract.

**Take next — pick one, in rough priority order:**

1. **Develop editor UI for jsonld** (the operator-facing authoring gap):
   - FIRST surface `kind`/`draftKind` in the READ path: `getComponentByName`,
     `ComponentRow`, `serializeComponent` carry NO kind today, so the editor can't tell a
     loaded component's kind. Add it.
   - Then a HTML | JSON-LD toggle in the component workbench; for JSON-LD, edit the JSON
     template (drop script/css panes), preview the emitted `<script type=application/ld+json>`
     inner JSON (or a Google Rich Results deep-link), save PUT with `kind:"jsonld"`.
   - Ship ONE proof jsonld component authored via the UI → published → validated in Google
     Rich Results (that's the render tracer's first real live exercise).

2. **Builder canvas invisible-element CHIP** for a jsonld block (empty `data-block-wrap` →
   selectable/deletable chip so operators can manage a block that renders no visible HTML).

3. **JSON-LD × bindings** (backlog): verify collection/`:param` binds interpolate into a
   jsonld component; a jsonld block reads the SAME `block.props` after `hydrateBlockBindings`,
   so single-item binds likely pass through — add a unit test through a bound value.

4. **AI authoring-guide section** for jsonld (schema.org patterns per page type + slot-quoting
   rules) — the tool `kind` param + validation are done; the model just needs the WHEN/HOW guide.

**HITL pending:** no D1 write ran here (needs binding); no worker.ts edit → no r-* release
needed. The render tracer is now authorable but hasn't been validated live (needs #1 or an
AI-authored proof component through a deployed CMS).
