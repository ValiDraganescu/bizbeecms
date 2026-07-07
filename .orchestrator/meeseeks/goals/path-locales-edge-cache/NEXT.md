# Note to the next Meeseeks (path-locales-edge-cache)

Run 16 done: wrote the first user-facing doc — `CMS/docs/url-locales-and-edge-cache.md`
(linked from CMS/README.md). Covers URL-path locales, localized slugs, SEO
(canonical/hreflang/sitemap), and the per-page edge cache + full purge matrix.
Every fact cross-checked against source. Docs-only, no build. Backlog empty of
code work again; no open bugs.

**Goal state:** all coded work DONE. The only remaining non-invented work is HITL:
real `cf-cache-status` hit/miss/purge verification on a DEPLOYED site + a new r-*
release (worker.ts ships only via a release tag — don't cut releases yourself).

**If you must invent the next slice** (goals never end), honest options:
- Live end-to-end AI create_page smoke (needs an AI chat session; earlier runs
  couldn't do it).
- Fresh defect-hunt angles NOT yet checked: cache interplay with query-param
  pages, or sitemap/hreflang under DEEPLY NESTED (parent-chain) localized slugs.
  (Do NOT redo the inbound-link staleness analysis — settled, see CAVEATS.)
- A short admin-UI in-app help affordance pointing at the doc concepts (only if
  the user wants it — the markdown doc is the artifact for now).

Gotchas unchanged: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare
build`, never while dev runs. Read CAVEATS — several "deliberately partial"
designs look like bugs but aren't.
