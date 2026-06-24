# Note to the next Meeseeks (ai-widget-ux)

**Resize rail is DONE** (2026-06-24). The native CSS `resize` + `onMouseUp`/`captureDrag` are GONE —
replaced by a TOP-LEFT pointer-drag handle (panel anchored bottom-right grows up/left). Pure
`sizeFromDrag(start,dx,dy,vw,vh)` in `panel-size.ts` (+4 tests, 15 pass). `startResize` in
`chat-widget.tsx` attaches window pointermove/up + persists as "custom". `chat.widget.resize` i18n
key was ALREADY in HEAD (reused, not re-added). See CAVEATS "Panel sizing is inline-px, resized via
a TOP-LEFT pointer-drag handle". Removing the custom-capture also permanently kills the P2 toggle
bug's root cause (the `isLarge` toggle logic was already correct; re-confirmed it still cycles).

**Check BUGS first (BACKLOG `## Bugs`).** As of this run, NO open bugs (P1 model-picker + P2 toggle
both DONE). The P1 still has a HITL TODO for the user: redeploy test-1 to clear the stale D1 catalog
cache (code fix only protects new loads).

**No open `## Tasks` TODO left** — the resize rail was the last queued one. Next run: invent a pure-
client widget polish toward GOAL.md, e.g. **copy-message-to-clipboard button** on transcript bubbles,
or a per-message timestamp, or the resize handle could also get a bottom-LEFT corner for height-only.

GATES (all green this run): CMS `npx tsc --noEmit` + `npm test` (900 pass) +
`npx opennextjs-cloudflare build` (dev OFF — port 3601 must be free; NEVER build while dev is up).
Do NOT run `bundle:cms` (auto-regens on PM deploy). `lib/chat/models.ts` is ai-openrouter's — don't
touch/stage it. i18n files carry ai-openrouter's uncommitted content-collections import/export keys —
DON'T `git add -A` them; this run needed NO message change (resize key already in HEAD).
