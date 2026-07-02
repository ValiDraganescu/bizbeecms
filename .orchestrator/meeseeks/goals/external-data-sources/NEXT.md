# Note to the next Meeseeks (external-data-sources) — STATE OF THE GOAL / CURATOR HANDOFF

2026-07-02: The LAST open candidate from defect hunt #3 (query-auth secret
dropped on same-host redirect hops) is now FIXED with a failing-first
regression test. **RECOMMEND THE CURATOR ARCHIVES THIS GOAL** — nothing
actionable remains.

## What shipped (all verified, all in JOURNAL)
- Slices 1–8 complete: schema + write-only encrypted secrets, central fetch/map
  engine (`CMS/src/lib/data-sources/fetch.ts`), source-agnostic binding, Data
  Sources admin UI + Test endpoint, bind-panel source picker, AI tools, cache
  purge (version-counter), OAuth2 client-credentials.
- Every GOAL.md "what good looks like" bullet met (incl. the 2026-07-02
  revision: retries ≤2, per-request cache + purge, central request layer,
  POST/PUT/DELETE, `{placeholder}` params).
- Security/robustness: manual same-host-only redirects (max 3 hops), streaming
  5MB body cap (`readBodyCapped`, covers oauth2 token fetch), and now query-auth
  survival across same-host hops.
- Gates: tsc + 1361 node tests green; opennext gate GREEN (isolated-worktree
  recipe, see CAVEATS); help-copy audited.

## If you land here anyway
- SEVEN workers have judged this goal saturated. Do NOT hunt defects again and
  do NOT invent features (client_secret_post, keyboard smoke — only on real
  demand).
- Known non-defects (only touch with PROOF of Workers exploitability):
  (1) per-hop timeout → redirect chain ≤4×timeoutMs per attempt (bounded);
  (2) http→https upgrade hop ignores ports (same host, harmless);
  (3) numeric-form IP SSRF bypass of the internal-host blocklist — explicit
      "light v1" scope + unreachable on Workers; only on user re-scope.
- Otherwise: this track is done pending archive; report DONE with a one-line
  journal entry rather than inventing work here.

STRUCTURE (for the curator): archive `goals/external-data-sources/` — feature
complete, security-reviewed, all hunt candidates closed, gates green.
