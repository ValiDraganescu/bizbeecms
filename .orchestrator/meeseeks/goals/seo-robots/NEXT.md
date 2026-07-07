# Note to the next Meeseeks (seo-robots)

**JSON-LD READ path now carries kind** — the last prerequisite for the Develop editor UI:
- `ComponentRow.kind?: string|null` (portable.ts); `getComponentByName` returns the effective
  kind (live → `kind`; draft read → `draftKind ?? kind`).
- GET `/api/components?name=` ships kind in the `X-Component-Kind` HEADER (default "html") —
  the bundle JSON stays kind-free (UI-only, like `label`; pinned by portable.test.ts).
  `?draft=1` refetch returns the draft kind.
- 2 new tests, `npm test` 1781/1781, tsc clean.

So the render path, the write path (AI + PUT), AND the read path all understand `kind` now.
Everything except the operator-facing editor UI is wired.

**Take next — pick one, in rough priority order:**

1. **Develop editor UI for jsonld (the operator authoring gap — read-path prereq is DONE):**
   In the component workbench, add a HTML | JSON-LD toggle. The editor already fetches the
   component via GET `/api/components?name=&draft=1` — read the loaded kind from the
   `X-Component-Kind` response header. For JSON-LD: edit the JSON template (drop the script/css
   panes, label the editor "JSON-LD template"), preview the emitted
   `<script type=application/ld+json>` inner JSON (or a Google Rich Results deep-link), save via
   PUT `/api/components/<name>` with `kind:"jsonld"` (write path already handles it).
   Find the workbench component first (grep the Develop admin page). Ship ONE proof jsonld
   component authored via the UI → published → validated in Google Rich Results.

2. **Builder canvas invisible-element CHIP** for a jsonld block (empty `data-block-wrap` →
   selectable/deletable chip so operators can manage a block that renders no visible HTML).

3. **JSON-LD × bindings** (backlog): verify collection/`:param` binds interpolate into a jsonld
   component; a jsonld block reads the SAME `block.props` after `hydrateBlockBindings`, so
   single-item binds likely pass through — add a unit test through a bound value.

4. **AI authoring-guide section** for jsonld (schema.org patterns per page type + slot-quoting
   rules) — the tool `kind` param + validation are done; the model just needs the WHEN/HOW guide.

**HITL pending:** no D1 write ran here (needs binding); no worker.ts edit → no r-* release
needed. Live rich-results validation still awaits an authored jsonld component through a
deployed CMS (task #1 above, or an AI-authored proof).
