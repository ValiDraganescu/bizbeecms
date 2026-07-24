# Plan: Translatable collection fields

Make individual collection fields (e.g. Restaurants.name/location/description) store
per-locale values so a component bound to a collection item renders in the active
content locale — the same way component **props** already localize today.

## Chosen approach (confirmed)
- **Storage:** locale-object JSON in the field's existing TEXT column
  (`{"en":"Cosy bistro","fi":"Viihtyisä bistro"}`), opt-in per field via a new
  `translatable` flag. No new columns, no per-locale schema migration.
- **Render:** parse the JSON into an object at query time → it flows through the
  EXISTING `resolveLocalized` seam (`tree.ts:402`) with **zero render-walk changes**.
- **Authoring:** per-locale editor (lang tabs) + AI-translate in the item editor,
  mirroring the page-builder `TranslatableField`.
- **Scope:** full vertical slice, tested end to end.

## Why this fits (from research)
- `resolveLocalized` already runs over hydrated block props and is a **no-op on
  plain strings** — so a parsed locale object resolves automatically. The three
  field→prop copy sites (`binding.ts:261`, `plan-list.ts:96`, `tree.ts:291`) need
  no change if the value is already an object.
- `multiselect` already sets the precedent of a JSON-encoded value in a TEXT column
  (`item-write.ts:97`) parsed on read — translatable text is the same shape.
- Content locales + `resolveContentLocaleContext` are already wired in render-page.

## Design invariants
1. **Opt-in, text-only.** `translatable` is meaningful only for `string`/`text`/
   `richtext`. Submission collections (bookings, enquiries) leave it off.
2. **Backward compatible.** A translatable column may still hold a **bare string**
   (legacy rows, or default-only). Read path treats a bare string as the default
   locale; `resolveLocalized` already handles bare strings. No data migration.
3. **Single parse seam.** Parse localized columns → objects in ONE place
   (`queryCollection` / the item GET store), so all readers (bindings, lists,
   list-JSON-LD, item editor) see a uniform shape.
4. **Graceful.** Malformed JSON → treat as a bare string. Never throw / 500 a render.

---

## Slice 1 — Schema flag (pure)
**`lib/content/collection-schema.ts`**
- Add `translatable?: boolean` to `CollectionField`.
- DDL unchanged (still one TEXT column). Add a helper
  `isTranslatableField(f)` = `f.translatable === true && (string|text|richtext)`.
- `db/schema.ts` collection-table comment: document the new flag + the
  locale-object-in-column storage.

**Tests:** schema parse keeps/ignores `translatable` correctly (only on text types).

## Slice 2 — Write/coerce (pure)
**`lib/content/item-write.ts` `coerceFieldValue`**
- New branch for a translatable text field: accept EITHER
  - a bare string → store as-is (default-only), OR
  - a `{loc: text}` locale object → drop empty locales, `JSON.stringify`.
  - collapse `{}`→null, single-default-locale→bare string (mirror the page-builder
    `setLocalizedProp` collapse rule so simple values round-trip clean).
- Reuse `isLocaleObject`/normalize from `render/localize.ts` (pure, importable).
- `buildInsert`/`buildUpdate` unchanged (they call `coerceFieldValue`).

**Tests:** locale object stringified; bare string preserved; empty locales dropped;
`{}`→null; required-empty rejected.

## Slice 3 — Read parse seam (the one central spot)
**`db/query-store.ts` `queryCollection`** and **the item GET store**
- After the SELECT, for each **translatable** field in `view.fields`, parse that
  column on every row: valid locale-object JSON → object; bare string → leave as-is;
  garbage → leave as-is. New pure helper `parseLocalizedRow(row, fields)` in
  `lib/content/localized-fields.ts` (node-tested).
- This feeds ALL three render copy sites + the admin item editor uniformly.

**Tests (pure `parseLocalizedRow`):** parses object columns, leaves bare strings,
leaves non-translatable columns untouched, tolerates malformed JSON.

## Slice 4 — Render resolution (verify, minimal/no change)
- Confirm the parsed object survives `hydrateProps`/`stampRow` → `resolveLocalized`
  at `tree.ts:402` picks the active locale. Expected: **no code change**, but add a
  focused test proving a bound prop + a List row resolve to the active locale.
- Filter/search caveat: `title LIKE '%x%'` now matches the JSON (all locales). Note
  it; acceptable for v1 (search still finds the item). No FTS change.

## Slice 5 — Item editor UI (per-locale + AI translate)
**`components/content/field-input.tsx` + `collection-items.tsx`**
- For a translatable text field, render a per-locale variant modeled on
  `page-builder/translatable-field.tsx`: lang tabs (EN/FI/RO-RO/ES from the Site's
  content locales) + AI-translate button (`kind:"component"`-style call to
  `/api/translate`, now stall-safe). Non-translatable fields unchanged.
- Draft state for a translatable field becomes a `{loc: text}` object; `saveDraft`
  sends that object (Slice-2 coerce handles it).
- Load: the item GET returns parsed objects (Slice 3), so the editor shows per-locale
  values directly.
- Reuse content locales via the existing settings/locales source.

**Tests:** pure merge/collapse helper shared with the page-builder if practical;
component logic kept thin (per the "test business logic only" rule).

## Slice 6 — Schema editor + AI tools
- **`components/content/collections-manager.tsx` `FieldRow`** and the add-field form:
  a "Translatable" checkbox (only enabled for string/text/richtext).
- **`lib/chat/collection-tools.ts`**: `create_collection` / `add_collection_field`
  accept `translatable?: boolean`; `add_collection_item` / `update_collection_item`
  document that a translatable field's value may be a `{loc: text}` object; validators
  updated. `query_collection` results now expose objects for translatable fields.
- Update the collections authoring guide text the assistant reads.

## Slice 7 — Import/export + edge cases
- Verify CSV export (`import-export.ts`) emits the raw column (JSON string) — fine, it
  round-trips on import. Optionally note it in the export header comment.
- Public Form submissions into a translatable field: store as default-locale bare
  string (a public visitor submits one language). No locale object from the form path.

---

## Restovista follow-up (after ship)
Once deployed and `test-1` redeployed to the new tag, flip `translatable: true` on:
- Restaurants: `name`, `location`, `description`
- Cities: `title`
- offers/events: `title`, `description`, (events) `location`
Then translate existing rows (per-item AI translate). Existing bare-string values keep
rendering as the default locale until translated — no breakage.

## Testing / verification
- Pure unit tests each slice (schema, coerce, parseLocalizedRow, render resolution).
- Full `npm test` green; `tsc --noEmit` clean.
- Manual: on `test-1`, mark a field translatable, translate a row, switch
  `bb_content_locale`, confirm the bound component/List renders the right language.

## Risks / decisions to flag
- **Search across locales:** LIKE now scans JSON — acceptable v1, documented.
- **Sorting a translatable column** sorts by raw JSON, not the active locale. Rare;
  document. (A later enhancement could sort by resolved default-locale text.)
- **No data migration needed** — bare strings are valid translatable values.
- Ship as its own release; then the Restovista field flips are data-only (no deploy).
