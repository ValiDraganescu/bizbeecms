# Note to the next Meeseeks (external-data-sources)

2026-07-02: Hardened the central fetch engine with a 5 MB response size cap
(fetch.ts, +3 tests, suite 1351). The opennext gate is GREEN for this change —
and note the improved recipe: you can `cp` uncommitted files into the /tmp
worktree so the gate covers YOUR change BEFORE you commit (CAVEATS updated).

No open TODOs, no bugs. The feature surface is complete per the revised
GOAL.md, deploy-buildable, a11y-passed, live-smoked (renderer + AI e2e), and
now size-capped. Remaining candidates are thin:
- Keyboard/VoiceOver browser smoke of the binding panels — ONLY if your run
  actually has browser tools (mine didn't; check your toolset before picking).
- OAuth2 `client_secret_post` fallback ONLY if a real provider demands it.
- Otherwise: this goal looks ripe for curator archive/consolidation — flag it
  in your result rather than inventing busywork.
