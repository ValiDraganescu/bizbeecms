# Note to the next Meeseeks (content-collections)

BUGS: NONE OPEN. v1 (Slices 0–6) DONE. Phase-2 binding: **Slices A + B + C + D DONE.**
The whole P2 binding track (operator UI + AI tools) is complete.

WHAT SLICE D ADDED (Slice 6's wiring pattern, applied to PAGE block mutation):
- `lib/chat/binding-tools.ts`: PURE schemas + `validateBindComponent`/`validateCreateList`/
  `validateBindList` (arg shaping only; node-testable). 16 tests in
  `scripts/binding-tools.test.mjs`.
- `tool-dispatch.ts`: 3 handlers that load a page's blocks → validate via SHARED
  `validateBinding`/`validateListBinding` → mutate via Slice-C page-blocks helpers →
  `setPageBlocks`. `tool-scopes.ts`: names in KNOWN_TOOL_NAMES + page-builder/pages contexts.
- NO cms-bundle regen / NO EN/FI/ET (AI-tool descs are model-facing — Slice-6 rule).

⚠ BUILD: `npx opennextjs-cloudflare build` could NOT be completed this run — it failed on a
PARALLEL worker's uncommitted `src/app/api/invite/route.ts` (`canInviteRole` not yet in
guard.ts). NONE of content-collections is at fault (tsc clean on our files). Once cms-auth's
invite slice lands, RE-RUN the build to confirm Slice D compiles end-to-end (dev server DOWN
first). If it still fails on a content-collections path, that's a real regression.

PICK NEXT (no greenlit binding work left — choose the highest-value Phase-2 slice):
1. **RE-VERIFY Slice D's build** once api/invite is committed (cheap, do it first if blocked).
2. **Phase-2 — drop/rename/retype field (schema rebuild)** — system-generated safe
   table-rebuild (create content_x_new + copy + drop + rename), fenced to content_*.
   Deferred from v1's add-only. PURE planner + thin store (Slice-2 split pattern).
3. **Phase-2 — per-locale collection fields** (content data is per content-locale).
4. **Phase-2 — pagination/sort/count in the operator items UI** (query store already
   returns total; the UI doesn't page yet).
5. **FTS5** (DEFERRED, see CAVEATS for the D1 export limitation) — bigger, re-confirm with user.
Phase 3 (route-driven detail pages + cross-collection refs) is NOT greenlit — needs the user.

GOTCHAS: binding/list config lives OUTSIDE props (setBlockField). renderer is lib/render/ NOT
lib/content/. src/ imports need `.ts` ext. AI binding tools mutate a PAGE (getPageBlocks/
setPageBlocks), unlike Slice-6 collection tools that hit the data stores. STAY OUT of
api/invite/**, lib/auth/guard.ts, db/schema, and don't run bundle:cms if a cms-auth worker
is active.
