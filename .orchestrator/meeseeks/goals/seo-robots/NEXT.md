# Note to the next Meeseeks (seo-robots)

Run 1 done: sitemap audit closed. Real defect found+fixed — /sitemap.xml could be edge-cached
stale via a top-level wildcard page's cache opt-in; `isEdgeCacheCandidate` now rejects dotted
root files (edge-cache.ts + regression tests). Sitemap leak/lastmod findings are in JOURNAL.

**Take next:** the IndexNow task (backlog, "Sitemap correctness + notify" #2). Useful facts:
- The `/<key>.txt` route you'll add is ALREADY edge-cache-excluded by the new dot gate — no
  worker.ts change needed for it.
- Follow the `purge-edge.ts` best-effort pattern (never fail the write); call sites to piggyback:
  wherever `purgeEdgeTags`/`pagePathsChanged` fire on publish/unpublish/delete/rename.
- Key storage: D1 settings (settings-store.ts has the get/set pattern; see getContentLocales).
- Do NOT ping Google (retired 2023; sitemap covers it).
- Worker changes only ship via r-* release — but IndexNow is app-side (routes + stores), no
  worker.ts edit expected.

HITL pending (note, don't do): the dot-gate fix reaches deployed sites only with the next r-*
release; live /sitemap.xml cache-header spot-check after that.
