---
description: Compact the current conversation into a handoff document at .orchestrator/handoffs/ so a fresh Claude session can pick up the work without losing context. Use when the context window is filling up or the user wants to hand off, compact, or wrap up the session's work for a fresh start.
argument-hint: "[what the next session will focus on]"
allowed-tools: Read, Write, Bash, Grep, Glob
---

Your task: write a **handoff document** that summarizes the current conversation so a fresh Claude session — with none of your context — can continue the work seamlessly. Context windows are finite; when one fills up, the next session starts blank. This file is the bridge.

The user invoked `/orc-handoff` with the following argument (may be empty):

```
$ARGUMENTS
```

If the argument is non-empty, treat it as a description of what the **next** session will focus on and tailor the doc accordingly — bias toward the information that session will actually need. If empty, write a general-purpose handoff covering the full state of the current conversation.

# Step 1 — Pick the output path

Handoffs live in their own folder **`<projectRoot>/.orchestrator/handoffs/`** — inside the `.orchestrator/` parent so they are committed to the repo.

Filename convention: `<YYYYMMDD-HHMM>-<kebab-slug>.md` (e.g. `20260514-1430-tabshell-refactor.md`). Timestamp-first so the directory sorts chronologically; the slug is for human-readability.

Build the path:
- Get the timestamp via `date +%Y%m%d-%H%M`.
- Derive a 2–5 word kebab-case slug from `$ARGUMENTS` if provided, otherwise from the dominant theme of the conversation.
- The project root is the cwd of the conversation; if you're inside a subdir, walk up until you find `.orchestrator/`.
- Ensure the directory exists (it should — `ProjectInitializer` creates it on init — but be defensive): `mkdir -p <projectRoot>/.orchestrator/handoffs`.

The handoff persists with the project — it lives under the repo at the path above, never in `/tmp` or a `mktemp` path.

# Step 2 — Take stock before writing

Before drafting, audit what's already captured elsewhere so you don't duplicate it. Check, as relevant:

- The Meeseeks goal tree, if the project uses it — `ls .orchestrator/meeseeks/goals/` and skim the relevant goal's `GOAL.md` / `BACKLOG.md` / `JOURNAL.md`.
- **Prior handoffs** under `<projectRoot>/.orchestrator/handoffs/` (`ls .orchestrator/handoffs/`) — if one exists for related work, reference it instead of restating its content; the next session can chain through them.
- Recent commits: `git log --oneline -20` and `git status` for uncommitted work.
- Open diffs: `git diff HEAD` for not-yet-committed changes.
- Plans, ADRs, design docs, or issue links the user shared in the conversation.
- Existing slash commands or subagent definitions the next session might need.

**Reference these by path/URL — never re-summarize their content.** The handoff is a *pointer index plus conversation-only context*, not a replacement for source material.

# Step 3 — Write the handoff

Use this structure. Drop sections that don't apply rather than padding them.

```
# Handoff — <one-line title>

**Date:** <YYYY-MM-DD>
**Next session focus:** <from $ARGUMENTS, or "continue current work" if empty>
**Project root:** <absolute path>
**Branch:** <current git branch, if in a repo>

## What we were doing
One short paragraph. The actual goal, not a play-by-play of every message.

## Current state
- Where we are right now: what's done, what's mid-flight, what's blocked.
- Anything uncommitted (point to `git status` / `git diff` rather than pasting the diff).
- Any spawned worker terminals or background tasks still relevant.

## Key decisions made this session
Bullet list, one line each. Only the decisions a fresh agent could NOT recover from the code/docs/commits alone — judgment calls, ruled-out approaches, "we tried X, it didn't work because Y".

## Open questions / blockers
Things waiting on the user, or things you don't yet know how to resolve. Be specific — "needs answer on whether to support legacy clients" beats "open questions about scope".

## Pointers (read these first)
- Plan/ADR: `<path or URL>` — what it covers
- Goal backlog: `.orchestrator/meeseeks/goals/<goal>/BACKLOG.md` — if the work is queued there
- Relevant files touched/read this session: `<path:line>` — why it matters
- Recent commits: `<sha> <subject>` (just the SHAs; the next session can `git show`)

## Suggested skills for the next session
Name the skills (or slash commands) the next session should load up front. Examples:
- `/orc-meeseeks-loop` — if the next session should drive Meeseeks workers at a goal
- `vercel-composition-patterns` — if the next session will refactor React component APIs
- `claude-api` — if the next session will work on Anthropic SDK code
Only suggest skills that match the focus; don't list everything available.

## How to resume
Concrete first action(s) the next session should take. "Read <path>, then run <command>, then continue from <state>." Make it small enough that the next session can execute immediately without re-interviewing the user.

## What NOT to redo
Things already settled. "Don't re-evaluate library X — we chose Y because Z." Prevents the next session from re-litigating decided ground.
```

# Step 4 — Quality bar

Before you finish:

- **Specific over generic.** "We rejected approach X because it didn't handle concurrent writes" > "we discussed several approaches".
- **Resumable.** The "How to resume" section lets the next session start working in under a minute.
- **Honest about gaps.** Something you don't know that the next session will need goes under "Open questions", in plain sight.
- **Outcomes and state, not transcript.** Summarize where things stand, never message-by-message.
- **Tight.** A good handoff is 1–3 screens. Longer usually means it's restating what a pointer would cover — the Step 2 rule.

# Step 5 — Report

Tell the user, in one or two sentences:
- The handoff path (it lives in `.orchestrator/handoffs/` and is now visible in the Orchestrator V2 sidebar's Library zone under "Handoffs").
- That the next session can be started in a fresh Claude terminal with a one-liner like `Read <handoff-path> and continue from "How to resume".`

Nothing else — no recap of the handoff body. The file is the artifact.
