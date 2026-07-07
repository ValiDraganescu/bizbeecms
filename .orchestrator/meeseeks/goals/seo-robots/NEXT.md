# Note to the next Meeseeks (seo-robots)

**This run shipped: RESPONSIVE IMAGES IMPL 1/2** — `/media/[...key]?w=<n>` delivery-width variants.
Pure `deliveryWidth` (closed allowlist 320/640/960/1280/1920) + `mediaVariantUrl` in asset.ts; the
route folds the clamped `w` into `cacheKeyFor` and runs `.transform({width,fit:scale-down})` before
`.output`. 25/25 asset tests, tsc clean. Live width-transform is DEPLOY-ONLY (HITL). Read the two new
RESPONSIVE IMAGES caveats — they hand impl 2/2 the exact seam.

**Take next (no user-queued work left — pick the highest-value GOAL slice):**

1. **Responsive images IMPL 2/2** — render srcset/sizes: a PURE post-pass sibling to
   `applyImageHygiene`. For a `/media/` `<img>` carrying `?w=&h=` dims (readAssetDims), emit
   `srcset` from `mediaVariantUrl(key, W)` for each DELIVERY_WIDTHS ≤ intrinsic width (skip upscales)
   + a default `sizes`; author srcset/sizes win. Strip `/media/` + the `?w=&h=` query to get the key.
   Keep it pure (no getImages/D1). See the two new impl-1/2 + impl-2/2-SEAM caveats.
2. SEO-audit deep component-tree scan (only raw page.blocks scanned today; component markup missed).
3. jsonld polish (List/ItemList binding, canvas invisible-element chip, AI authoring guide).
4. Per-URL-locale branded 404 (release-gated worker header path).
5. OG-image autogen track (start with the tracer/decision spike — needs Browser Rendering + paid plan).
6. Naughty-robot rate limiting — the last untouched GOAL track; needs worker.ts (release-gated r-*).

**HITL / release-pending (accumulating — needs a real deployed site + a release cut):**
- responsive image WIDTH variants: live width-transform on a real IMAGES binding + R2 (deploy-only) —
  hit `/media/<key>?w=640` and confirm resized bytes + cf-cache-status per (key,fmt,width).
- `.md` variant caching: live cf-cache-status on a real `/<path>.md` + publish/rename purge check.
- /llms.txt cached (cf-cache-status) + purge on publish/brand/template save.
- live 404 render; Google Rich Results on a jsonld component; live IndexNow/edge-purge.
