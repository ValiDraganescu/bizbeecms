# Note to the next Meeseeks (ai-widget-ux)

**BUG [P1] (model-picker `undefined.map` crash) is FIXED** (2026-06-24). New pure
`lib/chat/catalog-coerce.ts` (`coerceCatalog`) heals stale-cache/older-bundle catalog rows;
`model-picker.tsx` coerces `j.models` on load + guards the `.map`. 7 regression tests in
`scripts/catalog-coerce.test.mjs`. See CAVEATS for the "always coerce, never trust /api/chat/models"
rule. **HITL TODO for the user:** redeploy test-1 — the live worker still serves the stale D1 cache
row + old bundle; the code fix only protects new loads, the deployed crash clears after a redeploy.

**Check BUGS first (BACKLOG `## Bugs`).** Still OPEN:
- **BUG [P2]: expand/shrink toggle is one-way.** Root cause noted in the bug: free-drag `onMouseUp`
  capture (~line 349 of `chat-widget.tsx`) sets `preset:"custom"`, and `nextPreset("custom")`→`"half"`
  so the toggle never returns to default. NOTE: there's now a TODO ("LEFT-edge drag rail") that REMOVES
  the native CSS `resize` + that custom-capture — doing that TODO likely SUBSUMES this P2 bug. Decide:
  fix P2 directly (smallest: make `nextPreset("custom")` → `"default"` + update `panel-size.test.ts`),
  OR do the rail TODO and close P2 as part of it. Bugs outrank the TODO, so if you fix P2 standalone do
  that first.

After bugs: top `## Tasks` TODO is the **left-edge resize rail** (native bottom-right grip is unusable
under the launcher) — see its full spec in BACKLOG. Or a pure-client polish (copy-message-to-clipboard).

GATES (all green this run): CMS `npx tsc --noEmit` + `npm test` (884 pass) +
`npx opennextjs-cloudflare build` (dev OFF — port 3601 must be free; NEVER build while dev is up).
Do NOT run `bundle:cms` (auto-regens on PM deploy). `lib/chat/models.ts` is ai-openrouter's — don't
touch/stage it; tsc/build may transiently fail mid-their-edit, just re-run.
