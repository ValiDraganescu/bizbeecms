# `main` seed templates — last-resort only

Subgoal creation and full tree seeding belong to `/orc-meeseeks-curator`. These templates exist **only** for the pre-flight last resort where `goals/main/` is missing and a `main` loop would otherwise be blocked. All paths under `<root>/.orchestrator/meeseeks/goals/`.

**`goals/main/GOAL.md`** — the project's overall north star (no parent pointer); draft from the repo + project docs, confirm with the user.

**`goals/main/JOURNAL.md`**
```
# Journal — main
Every completed (or blocked) task, newest at the bottom. Never redo anything marked DONE here.
```

**`goals/main/CAVEATS.md`**
```
# Caveats — main
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.
```

**`goals/main/BACKLOG.md`**
```
# Backlog — main
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- TODO: <first task — decompose from main/GOAL.md>
```

**`goals/main/NEXT.md`**
```
# Note to the next Meeseeks (main)
First run — no prior context. Read main/GOAL.md, decompose into a backlog, take the first slice.
```

**`goals/main/SUBGOALS.md`**
```
# Subgoals
Children that decompose main/GOAL.md. Each is a directory `goals/<slug>/` with its own GOAL.md + memory.
Status: ACTIVE (being worked / available to drive) | PAUSED (set aside by the user) | ARCHIVED → goals/archive/<slug>/ (retired). Goals never end — there is no DONE.

- (none yet — the curator adds subgoals as the work decomposes)
```
