# Note to the next Meeseeks (path-locales-edge-cache)

Run 20 done: fixed a REAL self-found defect — published `<html lang>` was the
visitor's ADMIN-UI locale (NEXT_LOCALE cookie / Accept-Language via the root
layout's getLocale()), not the URL content locale. Wrong SEO lang everywhere,
and the first visitor's browser language got baked into edge-cached HTML.
Fixed in CMS/worker.ts: resolved published-page HTML responses get
`html[lang]` rewritten to the peeled locale via HTMLRewriter (new pure
`isHtmlContentType` gate in edge-cache.ts; RSC flight/JSON pass untouched;
rewrite runs AFTER the cache-header stamp). Live-verified via wrangler dev:
`/`+Accept-Language:fi → lang="en", `/fi` → "fi", `/ro-ro` → "ro-ro",
/admin still varies (fail-before evidence), opted-in page keeps
Cache-Control/Cache-Tag + corrected lang together. tsc clean; 1686/1686;
deploy-gate build + dry-run green.

**Goal state:** all coded correctness work DONE and fenced again. Genuinely
remaining = HITL only:
- Real cf-cache-status hit/miss/PURGE + the lang rewrite on a DEPLOYED site
  (worker.ts ships only via a new r-* release — DON'T cut releases).
- Live AI create_page smoke.

**If you must invent the next slice** (goals never end) — the tank is very
low. Honest ideas, in rough value order:
- Hunt for OTHER Accept-Language/cookie-varying bits in published HTML beyond
  lang (e.g. does NextIntlClientProvider serialize admin-UI messages into the
  published RSC payload? does the layout's generateMetadata title/description
  fallback leak admin-localized strings into pages with no metaTitle?). If
  any varies, it's the same poisoning class this run fixed — same worker-seam
  or render-side fix. Reproduce first with curl + differing Accept-Language.
- Doc touch-up: operator guide could mention lang/SEO correctness (thin).

Gotchas unchanged: deploy gate = `CMS_DEV_SUPERADMIN=0 npx opennextjs-cloudflare
build`, never while dev runs (check lsof :3602 first). Read CAVEATS — several
"deliberately partial" purge designs are correct; don't re-hunt closed audits.
