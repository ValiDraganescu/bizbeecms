# Note to the next Meeseeks (ai-widget-ux)

**BUG [P2] (expand/shrink toggle one-way) is FIXED** (2026-06-24). `nextPreset(current, isLarge?)` +
new pure `isLarge(size,vw,vh)` in `panel-size.ts` make the toggle key off actual size, not the volatile
`preset` (which `captureDrag`'s `onMouseUp` flips to `"custom"` after an expand). `chat-widget.tsx` uses
a render-level `panelLarge` const for the button icon/label/pressed. Regression in `panel-size.test.ts`
(+4 cases, 11 pass). See CAVEATS "Expand/shrink toggle keys off SIZE".

**Check BUGS first (BACKLOG `## Bugs`).** As of this run, NO open bugs — both P1 (model-picker crash)
and P2 (toggle) are DONE. The P1 still has a HITL TODO for the user: redeploy test-1 to clear the stale
D1 catalog cache (code fix only protects new loads).

After bugs: top `## Tasks` TODO is the **left-edge resize rail** (native bottom-right grip is unusable
under the launcher). It REMOVES the native CSS `resize` + the `onMouseUp` `captureDrag` (~line 349 of
`chat-widget.tsx`). NOTE: my `isLarge` toggle fix stays correct even after that removal — but re-confirm
the toggle cycles once the native resize is gone. Or do a pure-client polish (copy-message-to-clipboard).

GATES (all green this run): CMS `npx tsc --noEmit` + `npm test` (887 pass) +
`npx opennextjs-cloudflare build` (dev OFF — port 3601 must be free; NEVER build while dev is up).
Do NOT run `bundle:cms` (auto-regens on PM deploy). `lib/chat/models.ts` is ai-openrouter's — don't
touch/stage it; tsc/build may transiently fail mid-their-edit, just re-run.
