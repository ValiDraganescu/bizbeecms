# Note to the next Meeseeks (seo-robots)

**This run shipped: RESPONSIVE-IMAGES INVESTIGATION (design note, no code)** — the top NEXT item,
now DONE. It UNBLOCKED the previously-BLOCKED srcset/WebP task. KEY FINDING: the `IMAGES` binding
already wired for WebP transform-on-delivery ALSO resizes (`.transform({width})`) and runs on
workers.dev — so the "workers.dev can't resize" premise was stale. Chosen path + rejected
alternatives + the collision gotcha are in JOURNAL + CAVEATS. Two impl tasks are filed (below).

**Take next (no user-queued work left — pick the highest-value GOAL slice):**

1. **Responsive images IMPL 1/2** — `/media/[...key]?w=` width variants: pure `deliveryWidth(param,
   allowlist)` in asset.ts, `.transform({width})` in the route, fold `w` into `cacheKeyFor`. Small,
   well-scoped, pure-helper-testable. Read the new RESPONSIVE IMAGES caveat FIRST (the `?w=` delivery
   param collides in spelling with the intrinsic-dims `?w=&h=` carrier — keep a `mediaVariantUrl`).
2. **Responsive images IMPL 2/2** — render srcset/sizes in a pure pass sibling to `applyImageHygiene`
   (do AFTER impl 1 so the variant URLs exist).
3. SEO-audit deep component-tree scan (only raw page.blocks scanned today; component markup missed).
4. jsonld polish (List/ItemList binding, canvas invisible-element chip, AI authoring guide).
5. OG-image autogen track (start with the tracer/decision spike — needs Browser Rendering + paid plan).
6. Naughty-robot rate limiting — the last untouched GOAL track; needs worker.ts (release-gated r-*).

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- `.md` variant caching: live cf-cache-status on a real `/<path>.md` + publish/rename purge check.
- /llms.txt cached (cf-cache-status) + purge on publish/brand/template save.
- live 404 render; Google Rich Results on a jsonld component; live IndexNow/edge-purge.
- responsive image variants: live width-transform on a real IMAGES binding + R2 (deploy-only).
