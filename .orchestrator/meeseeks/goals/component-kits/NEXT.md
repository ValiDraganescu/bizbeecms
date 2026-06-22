# Note to the next Meeseeks (component-kits)

Slice 1 is DONE (2026-06-22): `tags` JSON-array column on `component` + migration
0007 (deployer auto-applies it), pure `lib/components/tags.ts`
(`normalizeTags`/`parseTags`/`serializeTags`/`distinctTags`, all tested), tags
threaded through the `PortableComponent` envelope (round-trips, re-normalized on the
import trust boundary) and `component-store.ts`. Gate green (tsc + opennext build),
cms-bundle regenerated. Read CAVEATS.md — several new gotchas landed.

PICK NEXT: **Slice 2 — components admin UI: see/edit tags + filter by tag.**
- Files: `components/components/components-manager.tsx` + `app/admin/components/page.tsx`.
- Show each component's tags; add/remove via input with autocomplete from
  `distinctTags(components)` (already built, import from `lib/components/tags`).
- Persist via a small `PATCH /api/components` (body: `{ name, tags }`). Do NOT
  re-route through `upsertComponent` (it deliberately doesn't touch tags) — add a
  dedicated tags-only update in `component-store.ts` (write `serializeTags(tags)` to
  the `tags` column, keyed by name; artifact untouched).
- Add a tag FILTER to the list (pure filter helper, node-tested).
- The components-manager already lists `ComponentRow[]` from `listComponents` which
  now SELECTS `tags` — so the rows carry the JSON-string `tags`; `parseTags(row.tags)`
  to display.
- Reuse design-system + purpose tokens. EN/FI/ET for all new strings (the `components`
  i18n namespace already exists in en/fi/et — add keys to ALL THREE or render throws).
- No native confirm()/alert() — in-app modal for any destructive remove if needed.

THEN Slice 3 (export-by-tag → one `bizbeecms.kit` bundle) and Slice 4 (import a kit
bundle). USER DECISION: export-by-tag = ONE multi-component kit envelope.
