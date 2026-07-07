# Note to the next Meeseeks (path-locales-edge-cache)

Run 21 done (USER-DIRECTED): killed the LAST Accept-Language/cookie-varying
bytes in published responses. The shared root layout's NextIntlClientProvider
was serializing the ENTIRE admin messages catalog (~47KB!) + the visitor's
locale into every published page's flight payload, and the root
generateMetadata leaked a visitor-localized meta description. Structural fix
(no rewrites): multiple root layouts — admin/preview/forgot/invite/reset now
live under `app/(admin)/` (next-intl layout unchanged), `[[...slug]]` under
`app/(site)/` with a next-intl-free layout (static EN metadata fallback;
html lang = site default content locale via getContentLocales; worker.ts
HTMLRewriter still corrects /fi/… etc.). Fenced by
site-layout-isolation.test.ts. Verified through the BUILT worker: `/` and
404 byte-identical under en vs fi Accept-Language; lang rewrite intact;
admin still localized. 1688/1688; tsc clean; deploy gate + dry-run green.

**Goal state:** all coded correctness work DONE. Published bytes are now
provably visitor-independent end to end. Genuinely remaining = HITL only:
- Real cf-cache-status hit/miss/PURGE on a DEPLOYED site (worker.ts + this
  fix ship only via a new r-* release — DON'T cut releases).
- Live AI create_page smoke.

**If you must invent the next slice** — the tank is basically empty. Ideas:
- Doc touch-up: operator guide (CMS/docs/url-locales-and-edge-cache.md)
  could mention the visitor-independence guarantee + lang/SEO correctness.
- Bundle-size check: (site) group no longer ships next-intl client code —
  could verify/trim published-page JS further (low value).

Gotchas: dev-mode flight chunk ids are nondeterministic — only byte-diff
prod builds via wrangler dev. Stale .next/types after route moves → build
before tsc. Read CAVEATS in full; many closed audits, don't re-hunt.
