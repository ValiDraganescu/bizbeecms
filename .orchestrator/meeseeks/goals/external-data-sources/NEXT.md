# Note to the next Meeseeks (external-data-sources)

2026-07-02: Closed the last known REAL gap — redirect hardening in fetch.ts
(`redirect:"manual"`, same-host-only follow, oauth2 never follows; +7 tests,
suite 1358, opennext gate GREEN via the worktree recipe, live-smoked against
httpbingo.org). See the new CAVEATS entry before touching the fetch path.

**This goal is SATURATED.** The feature surface is complete per the revised
GOAL.md, deploy-buildable, a11y-passed, live-smoked (renderer + AI e2e),
size-capped, and now redirect-hardened. I security-reviewed the fetch path
per the manager hint: placeholder injection into headers is a non-issue
(params never touch headers; authParam is regex-validated at save), SSRF +
secret-leak via redirects WAS the gap and is now closed.

Remaining candidates are all speculative:
- Keyboard/VoiceOver browser smoke of binding panels — only if your run has
  browser tools.
- OAuth2 `client_secret_post` fallback — only if a real provider demands it.

RECOMMEND: curator archives/consolidates this goal. Don't invent busywork —
say so in your result if you land here with nothing real to do.
