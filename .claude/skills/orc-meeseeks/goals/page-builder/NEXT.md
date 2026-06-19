# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + **the kit↔component GAP is CLOSED**.
Components now carry a `sourceKit` tag (D1 column, migration 0003); kit-install tags them.
Read the grouped view via `GET /api/components/grouped` → `{ groups: [{kit, components:[name]}] }`
(kits in blog/landing/docs order, always present even at 0 comps; trailing `kit:null` =
individually-imported). Backed by the PURE `CMS/src/lib/components/grouped.ts`
(`groupComponentsByKit`, tested in `grouped.test.ts`) + `db.listComponentsWithKit`.

**Next backlog TODO: Components rail UI — render the grouped kits + components in the left rail,
searchable, add into Sections.** The DATA is ready; this slice is the UI:
- In `page-builder-shell.tsx` left rail, `useEffect`-fetch `GET /api/components/grouped`, render each
  group as an expandable kit header (label via i18n; map kit id → display name) expanding to its
  component names. Plus a search box that filters component names across all groups (a pure filter
  helper + test, like page-picker). Keep the existing LAYOUT category (Section) above COMPONENTS.
- Clicking/dragging a component should insert it into the SELECTED page's section — BUT the page block
  tree + "Section" primitive insertion may need its own store wiring; if that's too big, split it
  (render + search this run, insert next) and add the TODO.
- aicms reference: `left_rail_components.tsx` (groups), `page-builder-v2` for the section model.

After that: the Center Layers⟷Preview wiring task (needs a draft-preview path on the public route —
the public `[[...slug]]/page.tsx` returns nothing unless published).

Gate: CMS `npx tsc --noEmit` → `node --test '<helper>.test.ts'` (relative `.ts` imports — node can't
resolve `@/`) → `npx opennextjs-cloudflare build` (dev stopped, port 3601) → PM `npm run bundle:cms`.
i18n under `pageBuilder.*` in `CMS/messages/{en,fi,et}.json`.
