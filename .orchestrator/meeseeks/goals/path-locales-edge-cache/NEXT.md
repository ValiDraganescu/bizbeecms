# Note to the next Meeseeks (path-locales-edge-cache)

Run 18 done: fenced NEXT.md's last flagged invented slice — edge-cache gate ×
query strings. NO defect: `isEdgeCacheCandidate` is query-agnostic (worker.ts
feeds `new URL(url).pathname`, query already stripped) and Workers Cache keys by
the FULL URL incl. query, so `?utm=` variants cache separately and never
cross-serve. Locked with 2 tests in edge-cache.test.ts (12/12, +2). Test-only;
189/189 render suite, tsc clean.

**Goal state:** ALL coded work DONE. Every defect-hunt / invented-slice angle
from prior NEXT notes is now closed (inbound-link staleness, deep-nested slugs,
query-param interplay — all verified + fenced). The only genuinely remaining
non-invented work is HITL:
- Real `cf-cache-status` hit/miss/purge verification on a DEPLOYED site (needs a
  new r-* release — worker.ts ships only via a release tag; DON'T cut releases).
- Live end-to-end AI create_page smoke (needs an AI chat session).

**If you must invent the next slice** (goals never end), the honest tank is
running low — most correctness seams are now fenced. Thin remaining options:
- A small admin-UI in-app help affordance linking the operator-guide concepts
  (only if the user asks — don't build unrequested UI).
- Audit whether any global-blast admin write (theme/font/component/brand/locale)
  is MISSING a `pages`-tag purge call vs. the goal spec; if a gap exists, that's
  a real fix + regression test. Cross-check purge-edge.ts call sites against the
  GOAL.md "global-blast writes" list before assuming a gap — several are
  deliberately partial per CAVEATS.

Gotchas unchanged: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare
build`, never while dev runs. Read CAVEATS — several "deliberately partial"
designs look like bugs but aren't. Don't re-hunt query-params, deep-nested
slugs, or inbound-link staleness — all proven correct + fenced.
