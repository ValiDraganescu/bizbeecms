# Handoff — Components gallery redesign + component-kit ZIP export/import

**Date:** 2026-07-03
**Next session focus:** Rebuild `/admin/components` as a preview-led gallery; add ZIP export ("pick components → one zip with asset bytes") and ZIP import, mirroring the site export/import UX.
**Project root:** /Users/valentindraganescu/git/dev/bizbeecms (all work in `CMS/`)
**Branch:** main

## What we were doing

The user invoked `/impeccable` on `/admin/components`: the page lists component
names only — no visual previews — so picking what to export is guesswork. A
shape brief for a preview-led gallery was presented and the user extended the
scope: export must produce a **ZIP** (components + their asset bytes) and
import must accept a ZIP, "similar to how we import/export the website itself"
(`/admin/settings/export-import`). Research is done; implementation has NOT
started. This session only wrote `CMS/PRODUCT.md` (impeccable project context).

## Current state

- **No gallery/zip code written.** Research + confirmed design direction only.
- The repo has uncommitted changes from earlier in this session that are
  UNRELATED to this task (settings second-sidebar layout, page-builder
  pending-changes warning, MCP rename, generated-image filenames, PRODUCT.md)
  — see `git status`. All 1568 tests pass, `tsc` clean. Do not mix new gallery
  work into those; the user owns commits (rule: never commit unasked; releases
  are a release manager's job — never offer to cut one).
- Dev server: `npm run dev` in `CMS/` (port 3602). Never run
  `npx opennextjs-cloudflare build` while dev runs.

## Confirmed design direction (user-approved shape, amended)

1. **Gallery grid of live previews** — each card embeds the pixel-true
   `/preview/component/<name>` route in a scaled (~1100px → card width,
   `transform: scale`), `pointer-events-none`, `loading="lazy"` iframe with a
   skeleton until load and an initial-letter fallback tile. Theme-match via
   the route's `?theme=` param.
2. **Card = pick affordance** (media-library-style ring+check selection);
   name/label, script/css/static badge, tag chips; per-card Export and
   open-in-Develop as quiet secondaries. Tag editing stays but subordinate.
3. **Toolbar**: client-side search, existing tag filter, select-all; sticky
   selection bar with "Export selected (n) as ZIP" + existing bulk tag ops.
4. **Page restructure**: gallery is the hero (widen from `max-w-3xl`); starter
   kits become a compact strip; Import section moves to the bottom, now
   accepting `.zip` as well as JSON. All existing flows preserved (kit
   preview-before-install, rebind UI for bare-JSON imports, install results).
5. Register is **product** (calm/restrained; see `CMS/PRODUCT.md`). The
   impeccable craft flow was in progress — hold its production bar (states,
   a11y AA, i18n EN/FI/ET for every new string, purpose tokens only).

## Research findings (the map for implementation)

**ZIP mechanics — copy the site pattern, client-side, `fflate` (already a dep):**
- `CMS/src/components/settings/export-import-manager.tsx` is the reference
  implementation: `zipSync`/`unzipSync` in the browser; envelope JSON + asset
  bytes as zip entries keyed **verbatim** by `asset.key` (`assets/<file>`);
  zip detection by extension OR `PK\x03\x04` magic bytes; per-asset upload
  loop with progress + failure list. No server zip handling anywhere.

**Component bundle format already does the bookkeeping:**
- `CMS/src/lib/components/portable.ts` — `PortableComponent` and `KitBundle`
  both carry `assets: string[]` (deduped `/media/<key>` deps via
  `enumerateAssetDeps`) and `componentDeps`. `buildKitBundle(rows, tag, opts)`
  is pure. `parseKitBundle` (line ~339) checks only format/version/components
  → **extra zip sidecar entries and extra envelope fields are tolerated**.
- Proposed zip layout (decision, see below): `kit.json` (existing KIT_FORMAT,
  unchanged — a single component exports as a kit of 1) + `assets.json`
  (metadata rows: key, filename, contentType, size, description, tags) +
  `assets/<key>` byte entries.

**Existing endpoints the export leg composes (no new server code needed):**
- Kit-by-tag export: `GET /api/components/export?tag=&name=&note=`
  (`CMS/src/app/api/components/export/route.ts`). **Needs a `?names=a,b,c`
  variant** (~20 lines: `listComponents()` → filter by names → same
  `buildKitBundle`) so "export selected" works without tagging first.
- Asset bytes: public `GET /media/<key>`; asset metadata: `GET /api/assets`
  (returns key, contentType, description, tags, size, createdAt).

**Import leg — one genuinely new server piece:**
- Existing gate: `POST /api/components {text, rebind?}` handles kit + single
  bundles; `POST /api/components/preview` gives the read-only pre-install
  summary. Client unzips, feeds `kit.json` text through these unchanged.
- **Missing:** an admin route to upload asset bytes+metadata for keys the
  target site lacks. The site-import one
  (`CMS/src/app/api/site-import/asset/[...key]/route.ts`) deliberately
  REFUSES keys absent from the `asset` table, so it can't be reused as-is.
  Needed: create-if-missing semantics — insert the D1 row from the zip's
  `assets.json` metadata then `storage.put` the bytes (essentially
  `putAsset` from `CMS/src/db/asset-store.ts`, which already accepts a fixed
  key). Guard with `isValidAssetKey`; content-type from the metadata row,
  never the request header (copy the site route's reasoning).
- With bytes bundled, the rebind UI becomes unnecessary for zip imports
  (assets arrive); it stays for bare-JSON back-compat.

**Preview infrastructure (for the gallery):**
- `CMS/src/app/preview/component/[name]/page.tsx` — real-renderer preview,
  placeholder-data-bound, admin-gated, supports `?theme=dark|light`. The
  Develop workbench (`CMS/src/components/components/component-develop.tsx`)
  already iframes it; `CMS/src/lib/chat/capture-preview.ts` proves the
  offscreen-iframe + scale approach works.
- Current UI to replace: `CMS/src/components/components/components-manager.tsx`
  (~970 lines: list, tags, bulk ops, kit export/preview/install, rebind) and
  `CMS/src/app/admin/components/page.tsx`. Preserve every behavior; restyle
  and re-arrange per the shape.

## Key decisions made this session

- ZIP assembly/parsing is **client-side with fflate**, exactly like site
  export/import — no server zip code. (Consistency + zero Workers memory risk.)
- ZIP always wraps the existing **kit format** (single component = kit of 1);
  `assets.json` sidecar carries asset metadata. No KIT_VERSION bump —
  `parseKitBundle` ignores unknown entries/fields.
- "Export selected" ships **one** bundle via a new `?names=` param on the
  existing export route — N-downloads-per-click was rejected (browsers block
  multi-download; multiple files are clumsy).
- Asset import policy: **skip keys that already exist** on the target site
  (keys are content-addressed `assets/<slug>_<ts>_<rand>.<ext>`), create
  missing ones from `assets.json` + bytes.
- Live scaled iframes over stored thumbnails (always current, zero new infra;
  lazy loading bounds cost).

## Open questions / blockers

- None blocking. Minor judgment calls left to the implementer: page size /
  virtualization if a site has hundreds of components (lazy iframes probably
  suffice); whether the destructive-import typed-confirmation from site
  import applies (probably NOT — component import is additive/upsert, not
  destructive, so the existing preview-before-install gate is enough).

## Pointers (read these first)

- `CMS/PRODUCT.md` — impeccable register + design principles (written this session).
- `CMS/src/components/settings/export-import-manager.tsx` — THE zip pattern to mirror.
- `CMS/src/lib/components/portable.ts` — bundle formats, `buildKitBundle`, `parseKitBundle`.
- `CMS/src/components/components/components-manager.tsx` — current UI (all behaviors to preserve).
- `CMS/src/app/api/components/export/route.ts` — add `?names=` here.
- `CMS/src/app/api/site-import/asset/[...key]/route.ts` — template for the new asset-upload route (invert its "must exist" check).
- `CMS/src/app/preview/component/[name]/page.tsx` + `CMS/src/lib/chat/capture-preview.ts` — preview iframe mechanics.
- `CMS/CLAUDE.md` — repo rules (migrations, dev/build, NumberInput/SpacingControls, testing discipline: pure `node --test` modules, relative imports, business logic only).
- Prior handoffs in `.orchestrator/handoffs/` are unrelated to this task.
- No PRDs in the kanban store (list_prds → empty).

## Suggested skills for the next session

- `/impeccable` (invoke as `/impeccable craft components gallery` or continue the in-flight craft flow) — the user started this under impeccable; hold its production bar and PRODUCT.md context. Note: setup will offer a skill update to v3.9.1; user hasn't answered — ask once.
- i18n discipline: every new string in `CMS/messages/{en,fi,et}.json` (no skill; repo convention).

## How to resume

1. Read this file, `CMS/PRODUCT.md`, and skim `components-manager.tsx` +
   `export-import-manager.tsx`.
2. Build in this order: (a) `?names=` on the export route + tests for the pure
   selection logic; (b) the new component-asset upload route (create-if-missing
   `putAsset` semantics) + pure-logic tests; (c) client zip export/import in a
   new gallery component (mirror `export-import-manager.tsx` flows); (d) the
   gallery UI itself per "Confirmed design direction" above; (e) i18n keys ×3
   locales; (f) `npm test` + `npx tsc --noEmit`, then verify visually on
   http://localhost:3602/admin/components (dev server usually already running).
3. Do not commit — report and let the user drive commits/releases.

## What NOT to redo

- Don't re-litigate zip-on-client vs zip-on-server — client-side fflate is decided (matches site export/import).
- Don't invent a new bundle format — reuse KIT_FORMAT + `assets.json` sidecar.
- Don't add a screenshot/thumbnail pipeline — live scaled lazy iframes are the decided preview mechanism.
- Don't rebuild the import trust boundary — `POST /api/components` and `/api/components/preview` stay the gate; the zip is just packaging around them.
- Don't touch the unrelated uncommitted changes in the tree (settings layout, pending-changes badge, etc.) — they're finished work awaiting the user's commit.
