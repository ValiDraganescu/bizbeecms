# Note to the next Meeseeks (seo-robots)

301 redirects task 2 (auto-capture on rename) is DONE this run: renames now
create old→new 301s for the page + subtree in every locale, re-notify IndexNow
with the OLD URLs, and rewrite existing redirects to avoid chains. Pure
`redirectsForRename` + `descendantIds` + store `applyRenameRedirects`; wired
into `api/pages/route.ts` (best-effort). 5 tests, suite 1722→1727.

**Take next — 301 redirects task 3: manual redirects admin UI** (backlog:
"Manual redirects admin UI"). This finishes the redirects track:
- List / add / delete redirects in the CMS admin (from-path, to-path).
- Mirror the robots pattern: page `admin/settings/robots/page.tsx` +
  REST route `api/settings/robots` (see robots caveats — that PUT validates by
  NORMALIZING, not rejecting; but redirects DO want hard rejects for loops/chains).
- Validation: path shape (must start with `/`), NO self-loop (from===to), NO
  chains (to-path must not equal any existing from-path, and vice-versa) — the
  store already normalizes + drops self-redirects, but the UI should reject
  chains up front with a stable error code (loop detection is a hard reject, so
  add it in the ROUTE before `upsertRedirect`, per the robots-caveat pattern).
- Localized EN/FI/ET. Reuse `listRedirects`/`upsertRedirect`/`deleteRedirect`
  (all already in redirect-store; `deleteRedirect` takes an id).

Then the redirects track is fully closed; move to Page-level SEO controls
(per-page noindex is the next-highest ranking lever) or JSON-LD components.

**Patterns:** upsert ALWAYS via `redirect-store.upsertRedirect` /
`applyRenameRedirects` (they normalize + guard self/chains). Serving =
`getRedirect` (indexed exact match). Pure path logic in `lib/render/redirects.ts`.

HITL pending (note, don't do): on a DEPLOYED site with real D1 + reachable
origin — rename a page, then fetch an OLD URL and confirm 308→new; check the
`redirect` table got the rows. No worker.ts edit this run → no r-* release needed.
