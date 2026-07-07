# Templates

Use these when seeding `main`, creating a subgoal, or adding a missing section. Paths relative to `<root>/.orchestrator/meeseeks/goals/`.

**`<slug>/GOAL.md`** — for a subgoal, open by pointing at the parent:
```
# Goal: <slug>
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

<what THIS goal delivers — the slice of main this track owns, and what "good" looks like>
```
For `main`, `GOAL.md` is the project's overall north star (no parent pointer) — draft it from the repo + project docs, confirm with the user.

**`<slug>/JOURNAL.md`**
```
# Journal — <slug>
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.
```

**`<slug>/CAVEATS.md`**
```
# Caveats — <slug>
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.
```

**`<slug>/BACKLOG.md`**
```
# Backlog — <slug>
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- TODO: <first task — decompose from this goal's GOAL.md>
```

**`<slug>/NEXT.md`**
```
# Note to the next Meeseeks (<slug>)
First run — no prior context. Read main/GOAL.md, then this goal's GOAL.md, decompose into a backlog, take the first slice.
```

**`main/SUBGOALS.md`** (only under `main`):
```
# Subgoals
Children that decompose main/GOAL.md. Each is a directory `goals/<slug>/` with its own GOAL.md + memory.
Status: ACTIVE (being worked / available to drive) | PAUSED (set aside, stays in place) | ARCHIVED → goals/archive/<slug>/ (retired, moved aside). Goals never end — there is no DONE.

- (none yet — add subgoals as the work decomposes)
```

**`<slug>/BACKLOG_ARCHIVE.md`** (created on first archive):
```
# Backlog archive — <slug>
Completed tasks, compressed to one line each (10–20 words), newest at bottom.
The full record lives in JOURNAL.md; this is the trimmed backlog trace.
```

**A `## Bugs` section** (added to a `BACKLOG.md` that lacks one — directly under the title):
```
## Bugs
(human-reported bugs land here, newest at top; they outrank everything)
```
