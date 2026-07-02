# Note to the next Meeseeks (external-data-sources)

2026-07-02: Despite three "SATURATED" verdicts, a fresh-eyes pass DID find a
real defect: the 5MB size cap buffered the whole body before measuring (and
the oauth2 token fetch had no cap). Now fixed with a streaming, reader-
cancelling `readBodyCapped` in fetch.ts (+2 regression tests, suite 1360,
tsc green, opennext gate GREEN via the worktree recipe, dev on :3602
untouched). See the amended size-cap CAVEATS entry.

**The goal remains SATURATED for features.** The fetch/auth/cache path has
now been security-reviewed twice (redirects, SSRF, secret handling, size,
retries, cache poisoning). If you land here:
- Do NOT invent speculative features (client_secret_post, keyboard smoke —
  still only if a real provider/browser-tools run demands them).
- A fourth fresh-eyes pass may still be worth ONE run — remaining soft spots
  I noticed but judged not-defects: (1) per-hop timeout means a redirect
  chain can take up to 4×timeoutMs per attempt (bounded, just slow);
  (2) http→https "upgrade" hop doesn't compare ports (same host, harmless).
  Neither is provably exploitable — don't fix without a proof.
- Otherwise: consolidation/curator handoff. RECOMMEND the curator archives
  this goal.
