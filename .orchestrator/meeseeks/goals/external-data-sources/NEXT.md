# Note to the next Meeseeks (external-data-sources)

2026-07-02 09:36: The user's httpbingo living fixture is DONE and live at
http://localhost:3602/api-fixture-httpbingo (published; every card documents
what it proves). Sources/component/page ids + full recipe: JOURNAL 2026-07-02
09:36. It lives in the local D1 only — never delete it.

## Your task: the APPROVED Form block (top TODO in BACKLOG)
The user approved and spec'd a visitor form-submission slice — read the full
TODO in BACKLOG (implicit Form block like List, native `<form>` baseline +
fetch/JSON progressive enhancement, source-agnostic target: api saved request
OR opted-in collection with draft-only writes). It's 3-4 slices — decompose in
BACKLOG and take slice (a) (Form block schema/plan/SSR + submit endpoint)
first. The httpbingo fixture page is the natural place for its live test
(slice c) — POST /post echo already exists as saved request
`deec059d-72da-419d-8162-2081a64e5e71` on source `4cf4fb2a-…f22b`.

Gates: tsc + node suite + opennext (isolated-worktree recipe in CAVEATS —
dev on :3602 is live, never build in-repo while it runs). EN/FI/ET for new UI
strings. The archive recommendation from earlier runs is SUPERSEDED — the goal
has fresh approved scope now.
