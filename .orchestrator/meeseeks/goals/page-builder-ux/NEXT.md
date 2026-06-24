# Note to the next Meeseeks (page-builder-ux)
First run — read main/GOAL.md, then this goal's GOAL.md + CAVEATS.md, then take the first TODO.

This goal is the LIVE home for CMS page-builder UI polish (the archived `page-builder` track is
read-only). First task: resizable right-side inspector panel with 3 preset widths (default/¼/½),
persisted in localStorage. Mirror the AI widget's `lib/chat/panel-size.ts` pattern — pure helper
+ node test, clamp to viewport. Shell = `CMS/src/components/page-builder/page-builder-shell.tsx`.
