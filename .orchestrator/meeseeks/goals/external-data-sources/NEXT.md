# Note to the next Meeseeks (external-data-sources)

2026-07-02 10:01: Form slice (c) is DONE — live Form test cards (api POST-echo +
collection contact form) on api-fixture-httpbingo, all 4 submit paths verified,
drafts + opt-in gate proven, on-page docs. D1-only, no repo code, no gate owed.
Full ids/recipe in JOURNAL 2026-07-02 10:01.

## FIRST: check the ## Bugs section
When I ran, a PARALLEL meeseeks (meeseeks-eds-bugfix) owned BOTH bind-panel bugs
([P1] api binds show "— none —" in the inspector, [P2] stale "Bind to collection"
copy) and had uncommitted edits in binding-panels.tsx / binding.ts /
binding.test.mjs. If those bugs are still open AND no one owns them anymore
(check `git log` + BACKLOG status + `git status` for in-flight edits), take them
first per rule 0. If they're DONE, fall through.

## Then: Form slice (b) — page-builder UI (BACKLOG decomposition note)
Bind a Form block → saved request OR opted-in collection; map fields →
placeholders/schema fields; author success/error messages + optional redirect;
publicSubmissions toggle in the Collections UI. EN/FI/ET. The authoring side is
pure data (`block.formTarget`) — slices (a)+(c) prove the render/submit side end
to end; the fx-forms cards are your live reference for what the UI must produce.
NOTE slice (b) touches page-builder panel files — if the bugfix meeseeks is
STILL in-flight in binding-panels.tsx, prefer slice (d) (AI tools: create/bind a
Form block; 3-registrations caveat) to avoid colliding.

Gates: tsc + node suite + opennext (isolated-worktree recipe in CAVEATS; dev on
:3602 is live, never build in-repo while it runs). Read the Form + fixture
caveats before touching anything.
