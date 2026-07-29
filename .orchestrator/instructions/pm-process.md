# PM process lessons

Read at boot (marked **always** in INDEX).

## Verify named implementation paths before they enter a Brief
(bulk-translate-missing, 2026-07-24) Brief AC7 named `applyTranslation` as the
page persist path; the path actually writes LIVE blocks, bypasses drafts, and
applies unrequested source-seed slots — violating the feature's own
never-overwrite invariant. A worker caught it; the brief had to be amended
mid-flight. Rule: when an acceptance criterion names a concrete function/route
as "the existing path", read that function first and check it against the
feature's invariants — or word the AC by OUTCOME ("matches what a manual
per-field edit does") and let the implementer pick the path.

(mcp-full-crud-patch, 2026-07-29 — recurred ×2, broader than paths) The PM
told T5 "no migrations needed" (the collection description column didn't
exist) and briefed AC2 around a "JSON-with-placeholders gate" in
validateRequestInput that never actually parsed JSON — the missing gate
shipped three tasks deep and only live QA caught the unbalanced-template
write. Sharpened rule: EVERY codebase fact a Brief or worker brief asserts —
columns, validators, gates, "X already handles Y" — is either (a) verified by
the PM/scout reading the code, or (b) worded as an outcome requirement
("patched bodyTemplate must be rejected if invalid after placeholder
substitution — build the gate if none exists"). When scouting, explicitly
task the scout with confirming each Brief assumption, not just mapping files.

## Stale-snapshot writes are the default bug in client-orchestrated batches
(bulk-translate-missing, 2026-07-24) Both never-overwrite breaches code review
found were the same shape: capture state at click time → long-running async work
→ write back the stale base, reverting concurrent edits. In any brief for a
client-driven batch/sweep that saves state, require: re-read the base
immediately before each write (or a functional merge against latest state), and
make merges fill-only where the invariant is "never overwrite".

## Ask about the parallel surface's levels in Phase 1
(bulk-translate-missing → list-item-translatables, 2026-07-24) A bulk action was
briefed at item + collection + page level; the user later expected the same
action at COMPONENT level ("like collections have") and at LIST level. Rule:
when a feature adds an action at N levels of one surface (item/collection),
Phase 1 must ask about every level of each PARALLEL surface (block/page/list)
— parity expectations are implicit in the user's mental model.

## Browser-QA the last control of scrollable panels
(list-item-translatables, 2026-07-24) A feature appended a section to the
inspector panel; the fixed AI-assistant launcher sat exactly on the new last
control at scroll-bottom, making it unclickable — invisible to review and
tests, caught only by PM browser QA. Rule: when a feature appends UI to a
scrollable panel, QA must scroll to the end and CLICK the last control, at
default viewport sizes; fixed overlays (launchers, toasts) love that corner.

## Refactor pass is part of the gauntlet
(user directive, 2026-07-24) After the last implementation task and before code
review: sweep touched files for simplification; any touched file at/near
1000 LOC MUST be decomposed — "pre-existing" is not an exemption (that's how
files got big). Behavior-preserving; reject high-churn/low-value ideas
explicitly, in writing.
