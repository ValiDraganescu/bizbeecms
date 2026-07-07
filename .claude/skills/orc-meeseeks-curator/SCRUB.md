# Autonomous scrub mode — when the loop spawns you

The `/orc-meeseeks-loop` driver periodically spawns you into a fresh terminal for mid-session backlog hygiene. You'll know because the channel message that woke you names **AUTONOMOUS SCRUB MODE**, a goal, and the driver's address. **No human is watching this terminal** — so questions have no one to answer them: make conservative choices, and when a call is 50/50, leave it as-is and note it in your report.

**Scope: the named goal only.** Read its full memory (`GOAL`/`JOURNAL`/`CAVEATS`/`BACKLOG`/`NEXT` + `BACKLOG_ARCHIVE` if present) plus `main/GOAL.md`, and look at the actual repo state — the scrub is a reconciliation between what the backlog *says* and what the repo *is*.

Do, in order:

1. **Truth-sync.** Cross-check every `TODO`/`DOING` in `BACKLOG.md` against `JOURNAL.md` and the filesystem. Flip anything already shipped to `DONE`. A stale `DOING` with no matching journal entry is a dead worker's leftover — flip it back to `TODO` with a note.
2. **Archive** — Job 4 exactly as written in `SKILL.md` (it's mechanical; it needs no user input).
3. **Reorganize** — Job 3, minus the confirm-with-the-user step: de-duplicate, split oversized tasks, re-word vague ones, re-rank so the most valuable actionable `TODO` is on top. Keep every piece of substance; when unsure, keep both lines.
4. **Missed angles.** Re-read the goal's `GOAL.md` against what the journal and repo say actually exists, and queue what's missing as new `TODO`s — each with a one-line rationale (`— queued by scrub: <why>`). Think: test gaps, error/empty/offline states, follow-ups the journal mentions that nobody queued, docs, platform parity, half-finished seams a worker noted in `CAVEATS.md`/`NEXT.md`. Add only tasks you'd defend to the user afterward — this is reconciliation, not brainstorm padding.
5. **Commit + report.** Stage exactly the goal files you touched (`git add -- <paths>`, the explicit-list guardrail as ever) and commit `curator(scrub): <goal> — <one-line summary>`. The scrub always commits: the next worker stages only its own paths, so an uncommitted scrub would dangle in the working tree. Then message the driver and stop:
   ```
   send_message({
     to: "<the driver's address from the wake-up message>",
     type: "result",
     content: "SCRUB <goal>: flipped <n> stale, archived <n>, added <n> TODOs (<short titles>), re-ranked. Flags: <structural suggestions, or 'none'>."
   })
   ```

Hard limits — your normal lane, spelled out because nobody is watching:

- **Structure stays untouched**: no creating/renaming/pausing/archiving subgoals, no `SUBGOALS.md` or `GOAL.md` edits. A track worth carving goes in your report's `Flags:` — the driver relays it to the human.
- **Human-reported bugs keep their grade and their place** — the one edit allowed is merging exact duplicates.
- Code and `JOURNAL.md` history stay the workers' — as ever.
