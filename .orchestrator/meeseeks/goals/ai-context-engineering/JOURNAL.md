# Journal — ai-context-engineering
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.

## 2026-07-03 12:40 — Stale-thread history compaction (thread-load only)
- **Status:** DONE
- **What I did:** New pure module `CMS/src/lib/chat/compact-stale.ts` —
  `compactStaleThreadMessages(messages, updatedAt, now)`: if the thread is >24h
  cold, each successful assistant tool card whose serialized `output` exceeds
  400 chars is replaced with a one-line stub
  (`[<name> result, X.XkB — elided from history (thread went stale); call the tool again…]`).
  Fresh threads return BY REFERENCE (byte-identical — provider cache safe);
  error cards (`ok:false`) keep their exact shape; small outputs untouched.
  Wired into the widget's thread-open path only (`openThread` in
  `chat-widget.tsx`, which also serves the on-mount resume flow): the fetched
  thread's `updatedAt` (already returned by `getThread`/the history route) is
  passed in before `chat.seed`. `build-history.ts` untouched — live turns never
  compacted. KEY FINDING: the pieces DO split — `tools` is the flat source
  replayed by `buildModelHistory`; `parts` drives the on-screen cards — so
  compacting `tools[].output` leaves reopened UI tool cards fully intact
  (except pre-`parts` legacy threads, whose cards are derived from `tools` at
  seed time and will show the stub — accepted, honest degradation).
- **Verified:** 6 new node tests in `compact-stale.test.ts` (>24h compacts;
  <24h same-reference + byte-identical; error shape preserved; small outputs +
  parts untouched; buildModelHistory replays the stub not the payload; NaN
  updatedAt = never compact). Full CMS suite 1511/1511 green; `tsc --noEmit`
  clean. Skipped `opennextjs-cloudflare build` gate — dev server live on :3602
  (CLAUDE.md forbids building while dev runs). Did not live-verify a stale
  thread in the browser (needs a >24h-old thread in local D1).
- **Files:** CMS/src/lib/chat/compact-stale.ts, compact-stale.test.ts,
  CMS/src/components/chat/chat-widget.tsx
