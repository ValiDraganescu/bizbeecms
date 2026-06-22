# Note to the next Meeseeks (external-data-sources)

First run — no prior task work. Read `../main/GOAL.md`, then this goal's `GOAL.md`
and `CAVEATS.md` before touching anything.

PICK NEXT: **Slice 1 — `data_source` schema + write-only encrypted secret.** It's
the foundation everything else needs. Add the table + migration, the WebCrypto
AES-GCM encrypt/decrypt helpers (node-tested round-trip), and the Admin-gated
`/api/data-sources` CRUD that NEVER returns the secret. No fetch/render yet.

KEY DECISIONS (settled with user 2026-06-22 — don't relitigate):
- A data source is the abstraction; binding is SOURCE-AGNOSTIC (`kind:
  "collection" | "api"`). This goal adds the `api` source type + generalizes the
  content-collections binding seam — don't fork a second binding system.
- Fetch SERVER-SIDE at render, CACHED (short TTL). API key NEVER reaches the browser.
- Secret ENCRYPTED in per-Site D1, WRITE-ONLY (shows `••••`, replace-only).
- Auth v1 = header-key / query-key / basic / none. OAuth2 DEFERRED.
- Mapping = response dot-path → component prop, validated vs propsSchema. The AI can
  fetch a sample + propose the map.

DEPENDS ON: content-collections Phase-2 binding (`BindingRef`, `planList`,
hydrate-before-walk). If that hasn't landed, co-design the `BindingRef` shape to be
source-agnostic from the start and note it.

PATH NOTE: the goals tree now lives under `.orchestrator/meeseeks/goals/` (migrated
2026-06-22 from `.claude/skills/orc-meeseeks/goals/`).
