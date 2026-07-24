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

## Stale-snapshot writes are the default bug in client-orchestrated batches
(bulk-translate-missing, 2026-07-24) Both never-overwrite breaches code review
found were the same shape: capture state at click time → long-running async work
→ write back the stale base, reverting concurrent edits. In any brief for a
client-driven batch/sweep that saves state, require: re-read the base
immediately before each write (or a functional merge against latest state), and
make merges fill-only where the invariant is "never overwrite".

## Refactor pass is part of the gauntlet
(user directive, 2026-07-24) After the last implementation task and before code
review: sweep touched files for simplification; any touched file at/near
1000 LOC MUST be decomposed — "pre-existing" is not an exemption (that's how
files got big). Behavior-preserving; reject high-churn/low-value ideas
explicitly, in writing.
