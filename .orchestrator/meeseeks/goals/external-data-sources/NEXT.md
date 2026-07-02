# Note to the next Meeseeks (external-data-sources) — STATE OF THE GOAL / CURATOR HANDOFF

2026-07-02: Consolidation run. **RECOMMEND THE CURATOR ARCHIVES THIS GOAL.**

## What shipped (all verified, all in JOURNAL)
- **Slices 1–8 complete**: schema + write-only encrypted secrets (AES-GCM via
  secret-box), central fetch/map engine (`CMS/src/lib/data-sources/fetch.ts`),
  source-agnostic binding (api kind in buildPlanFromPage), Data Sources admin UI
  + Test endpoint, bind-panel source picker (collection OR api, dot-path maps,
  sample-driven suggestions), AI tools (create/bind, id-persisted), cache purge
  (version-counter eviction, per-request + global), OAuth2 client-credentials.
- **Every GOAL.md "what good looks like" bullet is met**, including the
  2026-07-02 revision (retries ≤2, per-request cache config + purge, central
  request layer, POST/PUT/DELETE, `{placeholder}` param passing).
- **Two security passes done**: manual redirects (same-host only, max 3 hops,
  cross-origin = graceful fail, oauth2 never follows) and a streaming 5MB body
  cap (`readBodyCapped`, reader-cancelling, covers oauth2 token fetch too).
- **Gates**: tsc + 1360 node tests green; opennext build gate GREEN via the
  isolated-worktree recipe (see CAVEATS); live-smoked (AI e2e chat round-trip,
  published-page render of an api-bound List, httpbingo redirect behavior).

## Help-copy audit (this run)
UI copy + AI tool descriptions make NO claims contradicting shipped behavior.
Cache defaults in copy (on, 60s) match validate.ts. Redirect/size-cap failures
surface via the fetch engine's English error strings in the Test panel — by
design, not missing i18n (see new caveat).

## If you land here anyway
- SIX workers judged the goal saturated (defect hunt #3 = clean pass 2026-07-02);
  do NOT invent features (client_secret_post, keyboard smoke — only on a real
  demand).
- Known non-defects, only touch with a PROOF of exploitability ON WORKERS:
  (1) per-hop timeout → redirect chain ≤4×timeoutMs per attempt (bounded);
  (2) http→https upgrade hop ignores ports (same host, harmless);
  (3) numeric-form IP SSRF bypass of the internal-host blocklist
      (`http://2130706433` = 127.0.0.1, octal/hex/IPv4-mapped-IPv6) — real gap
      in the check's intent, but explicit "light v1" scope + UNREACHABLE on
      Workers (no fetch to 127.0.0.1/169.254, no metadata svc) + redirect
      resolver blocks cross-host. Only fix if the user re-scopes SSRF hardening;
      it is NOT a Workers-exploitable defect;
  (4) query-auth secret dropped on a same-host redirect (Location rarely carries
      the auth query param) — functional edge, same-host, query APIs rarely 3xx.
- Otherwise pick housekeeping elsewhere; this track is done pending archive.

STRUCTURE (for the curator): archive `goals/external-data-sources/` — feature
complete, revision directive satisfied, security-reviewed 2×, gates green.
