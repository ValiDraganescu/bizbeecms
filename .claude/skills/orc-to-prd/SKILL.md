---
description: Turn the current conversation context into a PRD and drop it into the project's triage queue in the kanban store. Synthesizes from what you already know — no interview.
argument-hint: "[optional title or focus hint]"
allowed-tools: Read, Bash, Grep, Glob, mcp__orchestrator__create_prd, mcp__orchestrator__list_prds, mcp__orchestrator__next_prd_number
---

Your task: take the current conversation context plus your understanding of this codebase and produce a **Product Requirements Document (PRD)**. Save it into the project's kanban store. You do NOT implement anything — this command authors the spec only.

Adapted from [`to-prd`](https://github.com/mattpocock/skills) — the core idea is the same: **synthesize, do not interview**. If the conversation hasn't given you enough to write the PRD without guessing, stop and tell the user what's missing rather than asking a wide-ranging interview.

The user invoked `/orc-to-prd` with the following argument (may be empty):

```
$ARGUMENTS
```

If non-empty, treat it as a title or focus hint and let it shape the slug + framing.

# Kanban-in-SQLite (read this first)

Per PRD_34 / ADR_0008, **PRDs are NOT files**. They are rows in an app-global SQLite kanban store, written through the `create_prd` MCP tool. The legacy `.orchestrator/prds/triage/PRD_<n>-<slug>.md` filesystem layout is dead — do not write there.

A PRD has:
- `key` — `PRD_<n>-<slug>` (no `.md` suffix), the stable identifier.
- `kind` — `feature` or `fix`.
- `stage` — `triage` / `todo` / `in-progress` / `qa` / `done`. New PRDs land in `triage`.
- `body_md` — the prose. This is what you author below.

# Step 1 — Ground yourself in the repo

If you haven't already during this conversation:

- Read the repo's CLAUDE.md(s) so you can use the project's vocabulary and respect its conventions.
- Skim any ADRs / design docs in the area you'd be touching (`docs/`, `*.md` near the affected modules).
- Note the project's type checker and test commands — these go into the testing decisions.

Use the project's own terminology throughout the PRD, not generic phrasing.

# Step 2 — Sketch the modules

Before writing, sketch the major modules you'd build or modify to implement the work. Actively look for **deep modules** — ones that hide a lot of behavior behind a small, testable interface that rarely changes. Prefer fewer deep modules over many shallow ones.

Check the sketch with the user in one short message: which modules they expect, and which ones they want tests for. Wait for their reply. If they push back, adjust before writing the PRD.

Skip this round-trip only if the conversation has already settled the module shape.

# Step 3 — Allocate the PRD key

Call `mcp__orchestrator__next_prd_number` to allocate the `<n>` for this project. The counter is monotonic and persisted in the kanban store — a number is never reused even if a PRD is later deleted. Do NOT pick `<n>` yourself by counting existing rows; that races other sessions.

Derive a 2–5 word kebab-case slug from `$ARGUMENTS` if provided, otherwise from the PRD's title. The key is `PRD_<n>-<slug>` (no `.md`).

Decide `kind`: `feature` for new functionality, `fix` for bug-fix-shaped PRDs. When in doubt, choose `feature`.

# Step 4 — Write the body

Use this template for `body_md`. Drop sections that don't apply rather than padding them with placeholders.

```
# <Title>

## Problem Statement
The problem the user is facing, from the user's perspective. 1–3 sentences.

## Solution
The solution to the problem, from the user's perspective. 1–3 sentences. Describe the behavior, not the implementation.

## User Stories
A long, numbered list. Each story in the format:

1. As a <actor>, I want <feature>, so that <benefit>.

Be extensive — cover happy paths, edge cases, failure modes, and adjacent flows the change touches. A short user-story list is usually a signal that the PRD isn't done yet.

## Implementation Decisions
The decisions that have been made (in this conversation or already in the codebase). Each item should be a *decision*, not a *task*. Include:

- Modules to build or modify (the sketch from Step 2).
- Interfaces of those modules that change.
- Technical clarifications agreed during the conversation.
- Architectural decisions and the reasoning.
- Schema changes.
- API / wire-format contracts.
- Specific interaction patterns the implementer must honor.

Do NOT include file paths or code snippets — those rot. **Exception:** if a prototype produced a snippet that encodes a decision more precisely than prose (state machine, reducer, schema shape, type signature), inline only the decision-bearing fragment and note it came from a prototype. Not a working demo, just the part the prose can't capture.

## Testing Decisions
- What makes a good test in this project (external behavior, not implementation details — follow the repo's existing pattern).
- Which modules will be tested.
- Prior art: pointers to similar tests in the codebase (by path or by description, not by snippet).

## Out of Scope
Explicit non-goals. Anything a reasonable reader might expect to be included but isn't. Be specific.

## Further Notes
Anything else the implementer needs to know. Open questions. Risks. Known unknowns.
```

# Step 5 — Save

Call:

```
create_prd({
  key: "PRD_<n>-<slug>",
  kind: "feature",      // or "fix"
  stage: "triage",       // default — explicit for clarity
  body_md: "<the full body authored in Step 4>"
})
```

The MCP listener resolves the project from its own identity; you never name a project. A duplicate key returns `prd_already_exists` — if that happens, the next-number allocator was bypassed somewhere; surface the conflict to the user rather than retrying blindly.

# Step 6 — Report

One or two sentences:
- The PRD key and title.
- That the row is in the `triage` stage of the kanban (visible in the sidebar's PRD board).
- How to advance it: drag the card to `todo` to accept, or call `move_prd({key, to_stage: "todo"})`.

Nothing else — the PRD row is the artifact.

# Quality bar

Before you finish:

- **Synthesize, don't interview.** If you needed more than one short clarification round in Step 2, the conversation isn't ready for a PRD. Stop and tell the user what's missing.
- **Decisions, not tasks.** "We will use a single AF_UNIX listener per project" is a decision. "Add a listener" is a task. Implementation Decisions is a decision log, not a TODO list.
- **Project vocabulary.** No generic terms when the codebase has its own ("Module" vs. "Package" vs. "Target" — match the repo).
- **Specific over vague.** "Fast" → quote a number. "Like X" → name the exact file or pattern.
- **No file paths in the body.** They rot. Module names and interfaces survive.
