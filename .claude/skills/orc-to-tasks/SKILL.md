---
description: Decompose a PRD into tracer-bullet task rows. Reads the PRD body from the kanban store, sketches vertical slices, confirms with the user, then writes each task to the kanban store via create_task as `TASK_<m>-<AFK|HITL>-<slug>` in the parent PRD's todo stage.
argument-hint: "<PRD key>"
allowed-tools: Read, Bash, Grep, Glob, mcp__orchestrator__read_prd, mcp__orchestrator__list_tasks, mcp__orchestrator__create_task, mcp__orchestrator__next_task_number
---

Your task: take a PRD that already exists in the kanban store and break it into independently-grabbable **tasks**, each written as a row via `create_task` in the parent PRD's `todo` stage. You do NOT implement anything — this command authors the spec only.

Adapted from [`to-issues`](https://github.com/mattpocock/skills). The core idea is the same: **synthesize tracer-bullet vertical slices, confirm with the user, then publish.** The publication target here is the kanban store, not a remote issue tracker.

The user invoked `/orc-to-tasks` with the following argument (required — empty is an error):

```
$ARGUMENTS
```

`$ARGUMENTS` should be a PRD key (`PRD_3-foo`) — `.md` suffix is also accepted and stripped. If empty or you can't find the PRD, stop and tell the user — don't guess.

# Kanban-in-SQLite (read this first)

Per PRD_34 / ADR_0008, **tasks are NOT files**. They are rows in the app-global SQLite kanban store, scoped to a parent PRD by `prd_key`. The legacy `.orchestrator/tasks/<prd-key>/todo/TASK_*.md` filesystem layout is dead — do not write there.

A task has:
- `prd` — the parent PRD's key.
- `key` — `TASK_<m>-<TYPE>-<slug>` (no `.md` suffix), the stable identifier within the parent PRD.
- `type` — `AFK` or `HITL` (the marker is BOTH in the key and a dedicated column; the tool enforces consistency on create).
- `stage` — `todo` / `in-progress` / `qa` / `done`. New tasks land in `todo`.
- `body_md` — the prose. This is what you author below.

# Step 1 — Resolve the PRD

Strip a trailing `.md` from `$ARGUMENTS` if present. Call:

```
read_prd({key: "<PRD_KEY>"})
```

- If it returns `prd_not_found`, stop and tell the user the key doesn't exist (suggest `list_prds` if they want to see what's there).
- The returned row's `body_md` is the PRD you're decomposing.
- The key **must** match `PRD_<n>-<slug>`. If it doesn't, stop and tell the user the PRD predates the current naming convention.

# Step 2 — Inspect existing tasks (guard against duplicates)

Call:

```
list_tasks({prd: "<PRD_KEY>"})
```

If the response is **non-empty**, the PRD has already been decomposed. Stop and tell the user — re-running would mint duplicate or conflicting task rows. Re-decomposition is a deliberate act: the user must delete the existing task rows (`delete_task` per row) before re-invoking.

If the response IS empty, proceed.

# Step 3 — Gather context (optional)

If you haven't already, skim the repo to ground the task slices in concrete modules: CLAUDE.md(s), the modules listed in the PRD's Implementation Decisions, and any ADRs in the area. Task titles + descriptions should use the project's vocabulary.

# Step 4 — Draft vertical slices (tracer bullets)

Break the PRD into **tracer-bullet** tasks. Each task is a thin **vertical slice** that cuts through every integration layer end-to-end (schema → API → UI → tests as applicable), NOT a horizontal slice of one layer.

Each slice is one of:
- **AFK** — can be implemented and shipped without human interaction.
- **HITL** — requires a human decision mid-implementation (architectural review, design call, schema sign-off). Prefer AFK over HITL.

Vertical-slice rules:
- Each slice delivers a narrow but COMPLETE path through every layer.
- A completed slice is demoable or verifiable on its own.
- Prefer many thin slices over few thick ones.

For each slice, note:
- **Title** — short, in the project's vocabulary.
- **Type** — AFK / HITL. Encoded BOTH in the key (e.g. `TASK_3-AFK-...`) and a dedicated `type` column on the row. `create_task` enforces that the key's token matches the `type` arg.
- **Blocked by** — which other slices (by their working title, since keys aren't allocated yet) must complete first.
- **User stories covered** — which US numbers from the PRD this addresses (if the PRD has them).

# Step 5 — Quiz the user

Present the proposed breakdown as a numbered list. Ask:
- Does the granularity feel right? (too coarse / too fine)
- Are the dependencies correct?
- Should any slices be merged or split?
- Are the AFK / HITL markings right?

Iterate until the user approves. Do not write rows until approval.

# Step 6 — Allocate task numbers + write rows

For each approved slice, **in dependency order** (blockers first) so the "Blocked by" field references an already-allocated task key:

1. Call `mcp__orchestrator__next_task_number({prd_filename: "<PRD_KEY>"})` to allocate the task's `<m>`. (The arg is named `prd_filename` for back-compat; pass the PRD key with or without `.md`.) Counters are per-PRD and monotonic; Orchestrator owns them so you never collide with concurrent allocations.
2. Derive a kebab-case slug (2–5 words) from the title.
3. Compose the task key as `TASK_<m>-<TYPE>-<slug>`, where `<TYPE>` is the literal token `AFK` or `HITL`.
4. Call `create_task` with the row:

   ```
   create_task({
     prd: "<PRD_KEY>",
     key: "TASK_<m>-<TYPE>-<slug>",
     type: "AFK",          // or "HITL" — must match the token in the key
     stage: "todo",         // default — explicit for clarity
     body_md: "<the full task body — see template below>"
   })
   ```

   A duplicate key returns `task_already_exists`; a missing parent PRD returns `prd_not_found`. Either is a hard stop — surface to the user.

Task body template (no `Type:` field — the key + `type` column are the source of truth):

```
# TASK_<m>: <Title>

**Parent:** <PRD_KEY>
**Blocked by:** <TASK_a, TASK_b> | None — can start immediately

## What to build
A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation.

Avoid specific file paths or code snippets — they rot. **Exception:** if a prototype produced a snippet that encodes a decision more precisely than prose (state machine, reducer, schema shape, type signature), inline only the decision-bearing fragment and note it came from a prototype.

## Acceptance criteria
- [ ] Criterion 1 (specific, verifiable)
- [ ] Criterion 2
- [ ] Criterion 3

## User stories covered
- US-<n> from <PRD_KEY>
```

# Step 7 — Report

One short message:
- The PRD you decomposed.
- The number of tasks written, with their full keys so the AFK/HITL split is visible (`TASK_1-AFK-foo, TASK_2-HITL-bar, ...`).
- That the rows are in the `todo` stage of the parent PRD's task board (visible in the sidebar).
- How the pipeline advances: PM calls `move_task` to move rows to `in-progress` → `qa` → `done` as work progresses.

Nothing else. The task rows are the artifact.

# Quality bar

- **Vertical slices, not layered milestones.** "Wire schema + handler + UI for the read path" beats "implement all the schema, then all the handlers, then all the UI".
- **AFK by default.** HITL is a deliberate marker for slices that genuinely need a human checkpoint, not a hedge for "I'm not sure".
- **Decisions inherited from the PRD.** Tasks don't re-decide architecture. If the PRD says "single AF_UNIX listener per project," the task references it and assumes it.
- **No file paths in the task body.** Module + interface names survive; paths rot.
- **One PRD per invocation.** Don't try to decompose multiple PRDs in one call. Run `/orc-to-tasks` again.
