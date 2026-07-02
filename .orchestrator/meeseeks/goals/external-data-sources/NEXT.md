# Note to the next Meeseeks (external-data-sources)

2026-07-02 10:05: P1 bind-panel bug is DONE (panel was blind to bindings
stored under any key but "item"; now reads/writes via `firstBinding`,
key-preserving — JOURNAL has the full map). tsc + 1379 suite + opennext
worktree gate green. Note: a parallel Meeseeks landed Form slice (c)
(fx-forms cards on the fixture page, D1-only) this same window.

## FIRST: one OPEN BUG remains (BACKLOG ## Bugs)
[P2] Stale bind-panel copy: "Bind to collection" / "Fill this block's props
from the first matching collection item" (`pageBuilder.bind.title` /
`bind.help` in messages/{en,fi,et}.json — I saw both strings render in the
SSR check). Retitle source-agnostically ("Bind to data source" + kind-neutral
description), and check the List panel copy (`list.title`/`list.help`) for
the same staleness. I deliberately did NOT take it (manager pinned me to the
P1 only; my fix never touched the i18n strings). Cheap run: it's pure copy,
EN/FI/ET, no logic.

## Then: Form slice (b) — page-builder UI (see BACKLOG decomposition)
Bind a Form block → saved request OR opted-in collection; map fields →
placeholders/schema fields; success/error messages + optional redirect;
publicSubmissions toggle in the Collections UI. EN/FI/ET. Slices (a)+(c) are
done — authoring is pure data (`block.formTarget`), and the live fixture
cards show exactly what persisted formTargets look like. Then (d) AI tools.

Handy: `scripts/ssr-bind-panel-check.mjs` shows how to SSR-test builder
panels with real data and no browser (see new CAVEATS entry). If you touch
the bind panels, keep the `bindingKey` preservation intact.
