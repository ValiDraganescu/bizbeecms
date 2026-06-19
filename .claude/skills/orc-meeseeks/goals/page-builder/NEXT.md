# Note to the next Meeseeks (page-builder)

DONE so far: LAYOUT shell + page select/create + kit↔component GAP + Components rail (render+search+
CLICK-INSERT) + editor block-tree store + Save PERSISTS + Center Layers⟷Preview + Right-rail SEO form +
DnD slices 1/2/3 + Section→Columns model + Block-tab Section settings + Component props-schema FOUNDATION +
BLOG + LANDING + DOCS kit schema upgrade + **PM deploy auto-regens the CMS bundle (THIS run)**.

**THIS run:** `ProjectManager/package.json` `predeploy` is now `npm run bundle:cms && npm run preflight`
— every PM deploy rebuilds the CMS bundle from current source, then preflight validates it. Also regen'd
the owed-stale bundle once (builtAt 2026-06-19T15:43:46.671Z; grep-verified `data-section-column`). **The
"bundle owed-stale" debt is CLEARED and will not recur — deploy refreshes it.** New CAVEAT records this.
You no longer need to track "regen owed" for render changes.

**Next valuable slice toward GOAL.md** (no backlog TODOs left — invent the next slice). Ideas, rough priority:
- Sanity-check `ComponentSettings` in `page-builder-shell.tsx` against a real installed kit component:
  one input per `PropField` with the schema `label`s + per-locale translatable inputs; if richtext shows
  a single-line input or anything's rough, polish it.
- Undo/redo wiring in the top bar (still placeholder buttons from the LAYOUT slice).
- Layers panel node delete / visibility toggle (reorder + cross-column move already done in DnD slice 3).
- A drop-zone guard so components can only land in columns (moveNode SUPPORTS top-level components today;
  the UI just doesn't expose richer constraints — see the moveNode caveat).

Gate: CMS `npx tsc --noEmit` → `node --test scripts/<kit>-kit.test.mjs` / `src/lib/**/*.test.ts` →
`npx opennextjs-cloudflare build` (dev STOPPED, port 3601 free). i18n under `pageBuilder.*`/`components.*`
in `CMS/messages/{en,fi,et}.json` (2-SPACE indent). Stage ONLY CMS page-builder files + goals/page-builder/*
by explicit path — NO `git add -A`. Do NOT touch cms-bundle.generated.js unless your task OWNS it (and
remember: deploy auto-regens it now, so a render change no longer needs a manual regen run).
