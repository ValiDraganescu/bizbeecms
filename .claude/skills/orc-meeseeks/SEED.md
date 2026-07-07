# Fallback seed templates — one goal only

**Normally you never need this.** `/orc-meeseeks-curator` owns the goal tree and seeds every goal directory before a worker runs. These templates cover the standalone fallback where your `GOAL_DIR` (or one of its files) is missing when you start: seed **just your one goal's** files so this run can proceed, flag the gap in your report's `STRUCTURE:` line, and leave everything else — sibling subgoals, `goals/main/SUBGOALS.md`, archiving — to the curator.

**`<GOAL_DIR>/GOAL.md`** (for a subgoal, open by pointing at the parent)
```
# Goal: <slug>
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

<what THIS goal delivers — the slice of main this track owns>
```
(For `main`, `GOAL.md` is the project's overall north star — if none was ever written, draft it from what the repo and any project docs tell you, then refine.)

**`<GOAL_DIR>/JOURNAL.md`**
```
# Journal — <slug>
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.
```

**`<GOAL_DIR>/CAVEATS.md`**
```
# Caveats — <slug>
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.
```

**`<GOAL_DIR>/BACKLOG.md`**
```
# Backlog — <slug>
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- TODO: <first task — decompose from this goal's GOAL.md>
```

**`<GOAL_DIR>/NEXT.md`**
```
# Note to the next Meeseeks (<slug>)
First run — no prior context. Read main/GOAL.md, then this goal's GOAL.md, decompose into a backlog, take the first slice.
```
