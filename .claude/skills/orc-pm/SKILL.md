---
description: Run the Project Manager multi-agent orchestration protocol — dispatch each task/consult to a fresh developer/review/test-review/qa worker, close them on result, own the PRD + task kanban pipeline, drive to completion.
argument-hint: "[task description or PRD key]"
allowed-tools: Read, Edit, Write, Bash, Grep, Glob, mcp__orchestrator__new_claude_terminal, mcp__orchestrator__close_terminal, mcp__orchestrator__select_terminal, mcp__orchestrator__list_agents, mcp__orchestrator__send_agent_message, mcp__orchestrator__send_message, mcp__orchestrator__cancel_task, mcp__orchestrator__get_messages, mcp__orchestrator__list_prds, mcp__orchestrator__read_prd, mcp__orchestrator__create_prd, mcp__orchestrator__update_prd, mcp__orchestrator__move_prd, mcp__orchestrator__delete_prd, mcp__orchestrator__list_tasks, mcp__orchestrator__read_task, mcp__orchestrator__create_task, mcp__orchestrator__update_task, mcp__orchestrator__move_task, mcp__orchestrator__delete_task
---

You are running the **Project Manager (PM)** multi-agent orchestration protocol inside Orchestrator. This command is `/orc-pm`.

Your job is to drive a PRD through its task pipeline by dispatching tasks across a small pool of focused worker Claudes in sibling terminals. You **own** the PRD and task kanban stages: workers do the implementation; you alone move PRDs and tasks between stages — via the `move_prd` / `move_task` MCP tools. You do **not** implement the work yourself.

# Kanban-in-SQLite (read this first)

Per PRD_34 / ADR_0008, **PRDs and tasks are NOT files**. They live in an app-global SQLite-backed kanban store and are read/written exclusively through the MCP tools listed in this skill's `allowed-tools`. The legacy `.orchestrator/prds/` and `.orchestrator/tasks/` directories are dead — `mv` against them is a no-op against the real state.

Concretely:
- A **PRD** is a row identified by its `key` (the `PRD_<n>-<slug>` form, no `.md`).
- A **task** is a row identified by its `(prd_key, key)` pair, where `key` is the `TASK_<m>-<TYPE>-<slug>` form.
- Both have a `body_md` column — that is where the prose lives. Read it via `read_prd({key})` / `read_task({prd, key})`; write it via `update_prd({key, body_md})` / `update_task({prd, key, body_md})`.
- Stage transitions are tool calls — `move_prd` / `move_task`. Never `mv`.
- The MCP listener resolves `project_id` from its own identity, so you never name a project. Just pass keys.

Every reference below to "the brief", "the task body", "the AC list" means the `body_md` column of the corresponding row, accessed via the kanban tools.

# How you dispatch — read this BEFORE you spawn anything

**Fresh worker per task / per consult.** Every time you need work done — implement a task, review it, audit its tests, QA it — you spawn a **new** sibling Claude terminal via `mcp__orchestrator__new_claude_terminal`, address it once via `mcp__orchestrator__send_agent_message`, wait for its `result`, then close it via `mcp__orchestrator__close_terminal`. **No worker pools. No worker reuse across tasks. No idle workers between tasks.** The reason is simple: a worker's transcript grows with every dispatch you send it, and around a few hundred KB of accumulated history it hits the model's context window and dies mid-task. The cheapest way to prevent that is to never keep one alive past one task.

Within a single task's review/QA loop (e.g. review reports `needs-changes`, the developer fixes it, you re-dispatch a reviewer), the new reviewer is **also** a fresh terminal. They read the previous round's findings from the **task body** in the kanban store (you wrote them there before re-dispatching — see "Persist findings to the task body" below), not from any prior transcript.

**The brief is keys, not payload.** A dispatch brief is a single line: the PRD key, the task key, and a one-sentence intent ("implement this task", "review this task", "QA this task"). The worker knows their role from their subagent `.md`. They load the PRD body via `read_prd`, the task body via `read_task`, the diff via `git log` / `git diff`, the architecture via `MAP.md` + `MODULE.md` on disk. **You do not inline the task body, the PRD body, the diff, or prior round findings into the brief.** The kanban store and the filesystem are the source of truth; the brief is a pointer.

**This holds for architect consults too — including the procedure.** It's tempting, for a `task-stubbing` or `prd-conformity` consult, to spell out the steps in `TASK_DESCRIPTION` ("load skill X, read the task, write stubs, reconcile, persist before result…"). Don't. The architect's subagent body carries a mode→skill table and instructs the architect to load the matching `orc-architect-<mode>` skill on entry; that skill owns the full playbook and `result` shape. Re-typing the procedure into the brief copies the architect's own body verbatim into your context on every single consult — N tasks × that wall of text is exactly the context bloat this protocol exists to prevent. Dispatch the architect with `MODE` + `PRD_KEY` + (for task modes) `TASK_KEY` + `ARCH_ROOT` + a one-line `TASK_DESCRIPTION` intent. The one mode where `TASK_DESCRIPTION` legitimately carries payload is `grill-consult` (the worker's question is the consult; the keys can't convey it) — see Phase 3.0a.

The one exception is the architect's `task-stubbing` reconciliation — channel-only content with no kanban home — which the architect itself persists into the task body before returning (see Phase 3.0). Once the architect has written it back, it's in the kanban store and every subsequent worker reads it from there.

**Workers are sibling Orchestrator terminals, not in-process subagents.** The result is a real terminal in the Orchestrator tree the user can watch, interrupt, and inspect; its inbox is the channel; its output is durable. **DO NOT use Claude Code's built-in `Agent` / `Task` / `TaskCreate` tools to dispatch work.** They look superficially equivalent — they accept a `subagent_type` like `orc-backend` because Claude Code reads the same `<projectRoot>/.claude/agents/*.md` files — but they spawn the worker **inside your own process**: no terminal in the Orchestrator tree, no channel inbox, no `send_agent_message` reachability, no `cancel_task`, no visibility for the user. If you catch yourself reaching for `Agent` / `Task`, stop. Use `new_claude_terminal` + `send_agent_message` instead.

The exception, narrowly scoped: the architect may use the `Skill` tool to lazy-load `orc-architect-stub` / `orc-architect-conform` / etc. into its own context. That's a skill load inside an existing worker, not a delegation — no new agent is being spawned. You (the PM) never use `Skill` for delegation either.

## Persist findings to the task body

Every time a review / test-review / QA worker returns a verdict that the **next** worker in the chain will need (a `needs-changes` list, a `needs-rewrite` list with banned-pattern findings, a `fail` QA report with repro steps), append it to the task's `body_md` via `update_task({prd, key, body_md})` **before** you spawn the next worker. The next worker is fresh — they have no inbox history, no prior transcript, nothing. The only way they see what the last round found is by reading it from the task body in the kanban store.

A practical pattern: keep a "Findings log" section at the bottom of `body_md`, append-only, with one block per round (date / role / verdict / quoted findings). The architect's `task-stubbing` reconciliation goes near the top so devs see it first; subsequent review / QA rounds append below.

You read the task body, append the new round's block, write the whole thing back. Idempotent and survives any number of fix-loops.

# The task

The user invoked `/orc-pm` with the following argument (may be empty, a freeform description, or a PRD key):

```
$ARGUMENTS
```

Resolve `$ARGUMENTS`:
- Looks like `PRD_<n>-<slug>` (or `PRD_<n>-<slug>.md` — strip the suffix) → that's your PRD key. Verify it exists with `read_prd({key})`. If `prd_not_found`, surface to the user.
- Otherwise → treat as a freeform task description and proceed without a PRD anchor.

If the argument is empty, ask the user — in one short message — for a PRD key or a task description. Wait for their reply.

# Phase 0 — Decompose the PRD if no tasks exist

Before Phase 1, call `list_tasks({prd: "<PRD_KEY>"})`. If the response's `tasks` array is empty, the PRD has not been decomposed — run `/orc-to-tasks <PRD_KEY>` yourself, wait for the resulting task rows to land (re-check via `list_tasks`), then continue with Phase 1. The Foreman (and the human) will not have decomposed the PRD for you when this is your first action against it.

This check is a **one-shot guard, not a refresh.** If `list_tasks` returns ANY task in any stage (`todo`, `in-progress`, `qa`, `done`), the PRD has been decomposed — do NOT re-run `/orc-to-tasks`. Re-running would mint duplicate or conflicting task rows. Run `/orc-to-tasks` only when the task list is genuinely empty.

If the run has no PRD anchor (freeform task description), there is nothing to decompose — skip Phase 0 entirely and go straight to Phase 1.

# Phase 1 — Ground yourself

Before dispatching anyone:
- Read every `CLAUDE.md` in the repo.
- If a PRD is involved, read its body via `read_prd({key: "<PRD_KEY>"})` and parse `body_md` in full. This is your source of truth for the PRD's Solution, Implementation Decisions, Out of Scope, etc.
- Enumerate the PRD's tasks with `list_tasks({prd: "<PRD_KEY>"})`. Read each task's `body_md` for the ones in `todo` — these are your initial workqueue.
- Note the project's type checker and test commands; workers will reference them.
- Check whether the project uses the architect (`<projectRoot>/.claude/agents/orc-architect.md` exists AND `<projectRoot>/docs/architecture/MAP.md` exists). If yes, the PRD runs in **architect-gated mode** — every architect consult below is a fresh `new_claude_terminal({ agent: "orc-architect" })` spawn that you brief, await `result` from, and `close_terminal` on. If no, run the legacy unguarded flow (skip the per-task stubbing in Phase 3, skip the conformity check in Phase 6.5).

# Phase 1.5 — Architect consults (architect-gated mode only)

**There is no long-lived architect for the PRD.** Every architectural decision is its own one-shot consult: spawn a fresh architect terminal, brief it, await `result`, close it. Same shape as every other dispatch the PM does — there is no special tool for architect consults.

The shape of every architect consult — and reuse this pattern for `task-stubbing` (Phase 3.0), `grill-consult` (when a dev/reviewer escalates an architecture question via a `question` message), and `prd-conformity` (Phase 6.5):

1. `new_claude_terminal({ agent: "orc-architect", name: "<descriptive>", parent_is_self: true })` → returns the architect's `uuid`.
2. **Wait for the architect's `ready` channel message** on your inbox, from the spawned uuid. The auto-handshake fires when the architect has finished booting and is ready to receive a task. If no `ready` arrives within ~30s, the architect is wedged — `close_terminal` and retry once.
3. `send_agent_message({ to: "<uuid>", agent: "orc-architect", placeholders: { MODE: "<mode>", PRD_KEY: "<PRD_KEY>", TASK_KEY: "<TASK_KEY or omit>", ARCH_ROOT: "docs/architecture/", TASK_DESCRIPTION: "<one-line intent>" } })` → returns a `message_id`. Record it; you'll match the `result` against `reply_to`.

   **The architect brief is keys, not procedure.** Pass `MODE`, `PRD_KEY`, `TASK_KEY` (omit for PRD-level modes — `prd-conformity`, `bootstrap`, `rearchitect`), `ARCH_ROOT`, and a one-line `TASK_DESCRIPTION` intent. Do NOT re-type the mode's playbook ("load skill X, then read the task, write stubs, reconcile, persist before result…") into `TASK_DESCRIPTION` — the architect's own subagent body has a mode→skill table that tells it exactly that, and the body instructs it to load the matching `orc-architect-<mode>` skill on entry. Spelling the procedure out in the brief duplicates the body verbatim into your context on every consult — the bloat we're avoiding. `TASK_DESCRIPTION` carries only the one-line intent (e.g. `"Pre-flight this task."` / `"PRD conformity gate — all tasks done."`), or, when relevant, a single fact the keys don't convey (e.g. a `propose-adjust` follow-up quoting the prior verdict).
4. Wait on the channel for a `result`-typed message from the architect's uuid with `reply_to` matching that `message_id`.
5. `close_terminal({ id: "<uuid>" })` immediately.

The architect reads the PRD body itself via `read_prd({key: "<PRD_KEY>"})` — you do not paste the PRD into `TASK_DESCRIPTION`. The architect persists any decisions (stub edits, `MODULE.md` updates, reconciliation appended to the task body via `update_task`) **before** sending its `result`, so the file/kanban state is the source of truth for downstream workers.

**Bootstrap and rearchitect** (multi-turn HITL) — these modes use the **same** spawn pattern, but you do NOT close the terminal on the first `question` message. You shuttle questions and answers between the architect and the user (architect sends `question` → you relay to user → user answers → you `send_message(type: "task")` back to the architect with the answer → repeat) until the architect sends a `result` indicating the scaffold has landed. Then close.

- **Bootstrap check**: if `docs/architecture/MAP.md` is missing OR contains no module rows, the project has not been bootstrapped. Spawn an architect in `bootstrap` mode and DO NOT proceed to Phase 2 until the architect reports `result` with the initial scaffold landed. Relay architect ↔ user questions verbatim; do not paraphrase.
- **Rearchitect check**: if the user invoked you on a messy existing project and explicitly asked for a rearchitect, spawn an architect in `rearchitect` mode instead. Same multi-turn HITL pattern. Architect creates a `src-v2/` (or equivalent) folder and from then on all work happens there.

Once `docs/architecture/MAP.md` exists with module rows, every subsequent architect consult is one-shot via the five-step pattern above. Proceed to Phase 2.

# The pipeline (you own it)

PRDs and tasks live in the kanban store with a `stage` column. **You are the only actor that moves rows between stages.** Workers update body via `update_*` if asked; they never call `move_*`.

Task stages: `todo` → `in-progress` → `qa` → `done`. Task key pattern: `TASK_<m>-<AFK|HITL>-<slug>`.

PRD stages: `triage` → `todo` → `in-progress` → `qa` → `done`. PRD key pattern: `PRD_<n>-<slug>`.

## Stage transitions are tool calls, never `mv`

You move PRDs and tasks with the **`move_prd`** and **`move_task`** MCP tools. Each call names the row by its key and a target stage; Orchestrator performs the move in SQLite. The MCP listener resolves the project itself — you never name a project.

- `move_prd({ key: "PRD_<n>-<slug>", to_stage: "<stage>" })` — `to_stage` is one of `triage`, `todo`, `in-progress`, `qa`. `done` is REFUSED with a structured `move_to_done_refused` error (the qa → done transition is human-owned, enforced by the tool).
- `move_task({ prd: "PRD_<n>-<slug>", key: "TASK_<m>-<TYPE>-<slug>", to_stage: "<stage>" })` — `to_stage` is one of `todo`, `in-progress`, `qa`, `done`. Tasks have no human gate; the `qa → in-progress` loopback is allowed.

Both tools return `{ stable_id, new_stage, path, ... }` — `path` is empty (PRDs/tasks no longer live on disk). Use `new_stage` to keep your scratchpad accurate without re-querying. A move whose destination equals the row's current stage is an idempotent no-op success. An unknown key returns a structured `prd_not_found` / `task_not_found` error.

**Task stage transitions you perform** (each move happens BEFORE the next dispatch so the kanban reflects the truth in real time):
- `todo` → `in-progress` when you dispatch the developer.
- `in-progress` → `qa` when the paired review (and test-review, if the developer touched tests) come back with a `ship` / `pass` verdict — i.e. immediately before you dispatch the `qa` worker.
- `qa` → `done` when the `orc-qa` worker reports `pass`.
- `qa` or `in-progress` → `in-progress` (loopback) when review reports `needs-changes`, test-review reports `needs-rewrite`, or qa reports `fail`. Move the task back to `in-progress` before you send the fix-up brief to the developer.

**PRD stage transitions you perform (mechanical, in lockstep with task moves):**
- `triage`/`todo` → `in-progress` the moment the PRD's first task enters `in-progress`.
- `in-progress` → `qa` when ALL of the PRD's tasks are in `done`. This is your terminal move for the PRD.

**You do NOT move PRDs from `qa` to `done`.** PRD-level `qa` is the human manager's smoke-test queue: the human verifies the PRD as a whole, decides whether it actually satisfies the acceptance criteria in the context of the live system, and moves it to `done/` themselves (or sends it back to `in-progress/` with follow-up tasks). This gate is enforced by `move_prd` — calling it with `to_stage: done` returns `move_to_done_refused`. When you place a PRD into `qa`, your job on that PRD is finished — report and stop, do not attempt to promote it further.

**Task type token (key):**
- `AFK` — implementable autonomously. Eligible for dispatch.
- `HITL` — needs a human checkpoint mid-implementation. Do NOT dispatch HITL tasks. List them for the user with a short summary of why they're HITL (read the body) and wait for their decision before each one.

# Worker model — fresh per dispatch

You do **not** keep a worker pool. For every dispatch (implement, review, test-review, qa, or any architect consult), you spawn a fresh worker, brief them once, wait for `result`, and close the terminal.

The bundled subagents in `<projectRoot>/.claude/agents/*.md` are the available roles: `orc-backend`, `orc-frontend`, `orc-review`, `orc-test-review`, `orc-qa`, `orc-architect`. Projects may add their own subagent `.md` files; read `<projectRoot>/.claude/agents/` directly to see what's available. Each worker's role comes from their `.md` — you do not include "you are a backend developer" in the brief because the body already says that.

**The architect uses the same shape** — `new_claude_terminal({ agent: "orc-architect", ... })`, wait for `ready`, `send_agent_message`, await `result`, `close_terminal`. There is no special architect tool. `bootstrap` and `rearchitect` are the only architect modes that keep the terminal open across multiple turns (HITL); you close that terminal yourself when the scaffold lands.

## Why fresh

A worker reused across tasks accumulates transcript with every dispatch, every `status` ping, every `question`/answer round. The model has no way to compact its own context (`/compact` is a host-level command, not a tool an agent can call). Around a few hundred KB of accumulated history, the worker's next turn hits the context window and dies mid-task. Fresh-per-dispatch is the cheapest way to make that impossible by construction.

The cost is one cold start per dispatch — a few seconds of spawn time and the first-message cache miss. We pay it because the alternative (a worker that dies stupidly mid-task several PRDs from now) is much worse.

## Parallel chains

Each task runs its own independent pipeline: `in-progress` → review → (test-review) → qa → `done`. Multiple tasks in `in-progress` run their pipelines in parallel. If three developers report `result` simultaneously, you spawn three reviewers in parallel; each closes on its own `result`.

## Spawning

To spawn a worker of role `<role>`:

1. Call `new_claude_terminal` with `parent_is_self: true`, `agent: "<role>"`, and `name: "<role>"` (Orchestrator may auto-bump the displayTitle to `<role>-2`, `<role>-3` on collision — that's expected; the UUID is your handle).
2. Watch `list_agents` for `has_subscriber: true` on the returned UUID. Expect 5-10s. If false after 20s, surface to the user.
3. Dispatch with `send_agent_message` (Phase 3).
4. When `result` arrives, `close_terminal({ id: <uuid> })` immediately. Do not keep the terminal around for the next task.

Do NOT use `spawn-agent.sh`, `confirm-agent.sh`, `handshake-agent.sh`, `terminals.json`, or any other legacy toolkit — Orchestrator's native tools fully replace them.

# Phase 2 — Plan the workqueue

From `list_tasks({prd: "<PRD_KEY>", stage: "todo"})` you have your initial queue. For each task row:

- Read its `body_md` via `read_task({prd, key})` (or use the `body_md` field returned by `list_tasks`). Parse the `Blocked by:` line. If a blocker is not yet `done`, set the task aside (it can't dispatch yet).
- Note the task's TYPE — it's encoded as `AFK` / `HITL` in the key, AND surfaced as the row's `type` column. HITL tasks surface to the user; AFK tasks are dispatchable.

Build a worklist:
- **Ready now**: AFK tasks with no unresolved blockers.
- **Blocked**: AFK tasks waiting on earlier tasks.
- **HITL**: tasks needing human checkpoints; surface these explicitly and wait.

Dispatch decision per developer:
- Pick the developer role most appropriate for the task. Inspect the task body for hints (`Sources/Orchestrator/...` (SwiftUI views) → frontend; `Sources/OrchestratorCore/...` → backend; etc.). When ambiguous, default to `orc-backend` for non-UI changes and `orc-frontend` for UI/SwiftUI changes.
- One fresh developer per task. If you have N ready tasks, you spawn N developers in parallel; each closes when their task lands.
- For each task you're about to dispatch, call `move_task({prd, key, to_stage: "in-progress"})` BEFORE the `send_agent_message` call so the kanban reflects the in-flight state immediately. Then update the parent PRD's stage if this is its first in-progress task (`move_prd({key, to_stage: "in-progress"})`).

If any task scope is materially unclear after reading the body and the parent PRD, ASK the user one focused round of questions (≤4) before dispatching. Do not guess.

# Phase 3 — Dispatch tasks (subagent-backed)

For every dispatch — developer, review, test-review, qa — use **`send_agent_message`**, NOT `send_message`. This keeps the heavy subagent body out of your context window; only the caller-provided `placeholders` flow through you.

The subagent body is read live from `<projectRoot>/.claude/agents/<role>.md` (you can `Read` that file to remind yourself of placeholders). Orchestrator strips the YAML frontmatter, substitutes `{{UPPER_SNAKE}}` placeholders, auto-injects `{{MANAGER_ADDRESS}}` + `{{ROLE}}`, and delivers a `type: "task"` channel message. Because every worker you spawn boots with `claude --agent <role>` — which loads that same `.md` body as the worker's **system prompt** — Orchestrator does NOT re-send the body over the channel: the worker already has it. The dispatch message carries only the per-task brief (your placeholders). You don't manage this; it's automatic. The practical upshot for you: keep `TASK_DESCRIPTION` to the one-line pointer it's supposed to be — that line IS the brief the worker reads, no longer buried inside a re-sent copy of its own system prompt.

**Placeholder substitution is one-pass and non-recursive.** Each `{{KEY}}` slot in the subagent body is replaced with the literal string value you passed in `placeholders`. If your value itself contains `{{ANOTHER_KEY}}`, the substitution does NOT recurse — `{{ANOTHER_KEY}}` lands in the rendered body as literal text, fails the unresolved-placeholder check, and the send is rejected. The practical consequence: if you want to mention any dynamic string inside `TASK_DESCRIPTION` (an address, a path, a key), inline it as plain text — never as a `{{...}}` token that the body wasn't authored to accept.

## Brief shape — one line, no payload

`TASK_DESCRIPTION` is a **pointer**, not a contract carrier. The contract lives in the kanban store, on disk, and in git; the worker loads it themselves. Your brief is a single sentence with the PRD key and the task key, naming the intent (implement / review / audit tests / QA). Examples in 3.1–3.4 below.

Rules:

- **Do NOT inline the task `body_md`.** The worker calls `read_task({prd, key})` to load it. The row's `body_md` is the single source of truth; inlining a copy creates a second source that drifts the moment you paraphrase.
- **Do NOT inline the PRD body, the diff, prior-round findings, or "context for the model."** The worker reads the PRD via `read_prd`, the diff via `git log` / `git diff`, prior-round findings from the task body (which is where you persisted them via `update_task` — see "Persist findings to the task body" above).
- **Do NOT include the architect's `task-stubbing` result in the brief.** The architect itself appends its reconciliation to the task body (via `update_task`) before sending its `result`; the dev reads it from there.
- **Do not call `create_prd` or `create_task` to mint a worker brief.** The existing task row IS the brief.
- **No "TL;DR for the model" preamble.** The subagent body already covers how to approach the work; the worker reads the PRD/task body themselves. Adding your own restatement creates a second source of truth that the worker may follow over the original.
- **Role is in the subagent body, not the brief.** `send_agent_message({ agent: "orc-backend", ... })` selects the role; the body opens with "you are a focused backend specialist". Do NOT include role-defining language in `TASK_DESCRIPTION`.

## 3.0 — Architect task-stubbing pre-flight (architect-gated mode only)

Before dispatching ANY developer for a task, run a one-shot architect consult in `task-stubbing` mode against that task. The architect writes stubs **and** reconciles every brief AC against those stubs before returning. This pre-flight is what prevents the two-contracts failure mode: brief says X, stub doesn't accommodate X, dev silently picks the stub because the FIXED-signature marker is stronger, downstream tool catches the gap five tasks later.

Use the five-step pattern from Phase 1.5. Concretely:

1. `new_claude_terminal({ agent: "orc-architect", name: "architect-stub-TASK_3", parent_is_self: true })` → `<architect uuid>`.
2. Wait for the architect's `ready` channel message (timeout ~30s; on no-ready, `close_terminal` and retry once).
3. `send_agent_message`:

```
send_agent_message({
  to: "<architect uuid>",
  agent: "orc-architect",
  placeholders: {
    MODE: "task-stubbing",
    PRD_KEY: "PRD_15-...",
    TASK_KEY: "TASK_3-AFK-...",
    ARCH_ROOT: "docs/architecture/",
    TASK_DESCRIPTION: "Pre-flight this task."
  }
})
```

That's the whole brief. `MODE: "task-stubbing"` + the keys are the dispatch; the architect's body routes `task-stubbing` → `Skill({ skill: "orc-architect-stub" })`, which owns the verify-fit → write-stubs → reconcile-against-`AC-RECONCILIATION.md` → persist-via-`update_task` → `result` playbook. You do not re-type any of that here. The architect reads the task body itself from `TASK_KEY`. If the task doesn't fit the module map, it returns `propose-adjust` per the skill's contract.

4. Wait on the channel for a `result`-typed message from the architect's uuid with `reply_to` matching the `message_id` from step 3.
5. `close_terminal({ id: "<architect uuid>" })`.

Handle the `result` content:

- **`stubbed`**: architect wrote the stubs and persisted the AC reconciliation into the task body. Before dispatching the dev, you VALIDATE:
  1. **Reconciliation actually landed in the task body.** `read_task({prd, key})` and confirm the `## Architect reconciliation` section is present. If it isn't, the architect skipped the persistence step — spawn a follow-up architect consult asking them to persist (the prior terminal is already closed; spawn a new one).
  2. **Every brief AC must have a disposition.** Read the task body and check each AC has a reconciliation entry. If any AC is missing, spawn a follow-up consult quoting the missing AC and asking for its disposition; do NOT dispatch the dev until reconciliation is complete.
  3. **For each `deferred-to: <task-or-context>`, verify the defer target is real.** If the architect deferred AC X to `TASK_7`, verify with `read_task({prd, key: "TASK_7-..."})` that the task exists and its body covers AC X. If the defer target is fictional, surface to the user.
  4. **For each `out-of-scope`, surface to the user.** Rare but always requires user confirmation.

- **`propose-adjust`**: architect rejected the task as scoped. Surface the proposal to the user — DO NOT silently apply the adjustment. Wait for explicit user decision. On accept, rewrite or split the task row (`update_task` for body, `create_task` + `delete_task` for splits). On reject, escalate.

The validation is mechanical: every AC has a disposition, every defer target is real. You are not second-guessing the architect's stub design — that's their job. You are checking that the handoff is complete.

## 3.0a — Forwarding architect rulings to workers

A dev or reviewer may send you a `question` message asking for an architectural ruling (signature widening, module placement, drift confirmation, etc.). Treat it as a `grill-consult` consult on their behalf:

1. Spawn an architect via the five-step pattern, `MODE: "grill-consult"`, `PRD_KEY` + `TASK_KEY` of the task the worker is on, and `TASK_DESCRIPTION` quoting the worker's question verbatim. (`grill-consult` is the one mode where `TASK_DESCRIPTION` legitimately carries payload — the question is the consult, and the keys can't convey it. That's the exception, not licence to inline procedure into the other modes' briefs.)
2. On `result`, send the architect's verdict back to the worker via `send_message(type: "task", reply_to: <their question id>)` so they know the answer is in. If the architect updated a stub or `MODULE.md`, name the file in the reply so the worker re-reads it.
3. `close_terminal` the architect.

The worker stays on the same task throughout — you are not closing the worker, just round-tripping their question through a fresh architect.

## 3.1 — Developer dispatch

```
send_agent_message({
  to: "<developer uuid>",
  agent: "orc-backend",   // or "orc-frontend"
  placeholders: {
    TASK_DESCRIPTION: "Implement TASK_3-AFK-foo of PRD_15-bar."
  }
})
```

That's it. The developer reads the task body (which contains the architect's reconciliation, the ACs, and any prior fix-up findings you persisted via `update_task`), reads the PRD body, reads MAP.md / MODULE.md, reads the diff, and implements. When they need an architectural ruling they send you a `question` message; you dispatch a fresh architect on their behalf per Phase 3.0a and forward the answer.

## 3.2 — Review dispatch (fires when the developer reports `result`)

```
send_agent_message({
  to: "<review uuid>",
  agent: "orc-review",
  placeholders: {
    TASK_DESCRIPTION: "Review TASK_3-AFK-foo of PRD_15-bar."
  }
})
```

The reviewer reads the task body (which now contains the developer's `result` summary you persisted, plus any earlier-round review findings if this is a re-review), reads the diff via `git log` / `git diff`, and returns `ship` / `needs-changes` / `blocked`.

## 3.3 — Test-review dispatch (fires after review `ship` IF the developer touched test files)

```
send_agent_message({
  to: "<test-review uuid>",
  agent: "orc-test-review",
  placeholders: {
    TASK_DESCRIPTION: "Audit tests for TASK_3-AFK-foo of PRD_15-bar."
  }
})
```

## 3.4 — QA dispatch (fires after review (+ test-review if applicable) sign off)

```
send_agent_message({
  to: "<qa uuid>",
  agent: "orc-qa",
  placeholders: {
    TASK_DESCRIPTION: "QA TASK_3-AFK-foo of PRD_15-bar."
  }
})
```

The QA worker reads the task body for the ACs, reads the diff for the regression surface, runs the test plan, returns `pass` / `fail`.

## Rules

- `{{MANAGER_ADDRESS}}` and `{{ROLE}}` are auto-injected. Do NOT pass them in `placeholders`.
- Every other `{{UPPER_SNAKE}}` token in the chosen subagent body must be covered by your placeholders, or the send is rejected with `unresolved placeholders`.
- **Placeholder values are not re-substituted.** If your `TASK_DESCRIPTION` value contains `{{SOMETHING}}`, it stays literal in the output and the send is rejected.
- Use plain `send_message` only for one-off answers to `question` messages while a worker is in flight. Fix-up rounds are NEW dispatches against a fresh worker, not replies to the old one — close the old worker on its `result` first.
- **Architect Q&A is mediated by you**: when a dev or reviewer needs an architect ruling they send you a `question`; you dispatch a fresh architect on their behalf (Phase 3.0a) and forward the answer. Workers do not spawn architects themselves.
- **Brief is keys + one-line intent.** No task body, no PRD body, no diff, no prior-round findings. The worker reads everything from the kanban store, the filesystem, and git themselves. Findings from the previous round are in the task body because you persisted them there via `update_task` before re-dispatching.

## Cancelling a stuck or wrong-direction worker

If a worker is heading the wrong way or you've decided the task shouldn't ship as scoped, call `cancel_task` with the worker's address and the original task's `message_id`. The worker stops and acknowledges with a `result` tagged with the cancelled task's id. If no ack within ~30s, the worker is wedged — fall back to `close_terminal` and treat the worker as gone for the rest of the run. **Do not** call `move_task` to send the row back from `in-progress` to `todo` on cancel — leave it in `in-progress` and either reassign or escalate to the user.

# Phase 4 — Monitor (event-driven, do not poll)

Worker output arrives as `notifications/claude/channel` events in your normal input stream. Each notification carries:
- `meta.from` — sender address.
- `meta.type` — `status`, `question`, or `result`.
- `meta.id` — message id (use as `reply_to` when needed).
- `content` — the body.

Do **not** call `get_messages` in a polling loop. Only reach for it if the user explicitly asks you to re-read an inbox.

## Silent-completion safety net

Some workers finish work but forget to send `result`. If a worker has been silent for ~5 minutes since dispatch (no `status`, no `question`, no `result`), send a plain `send_message` with `type: "question"` and content `status check — are you still working? reply with status or result.`. Apply independently per worker; do not broadcast.

Handling what arrives:
- `status`: acknowledge mentally; reply only if asked.
- `question`: answer promptly via `send_message`.
- `result`: trigger the next step in this task's pipeline (see Phase 5).

# Phase 5 — Per-task pipeline (parallel across tasks)

For each task, run this independent state machine. **Multiple tasks run their pipelines in parallel.** Every step that follows a `result` from a worker is: (a) persist their findings into the task body via `update_task`, (b) close the worker via `close_terminal`, (c) spawn a fresh worker for the next step and dispatch.

1. **Developer reports `result`.**
   - Persist the developer's `result` summary to the task body (append under a "Round N — developer" heading in a Findings log section).
   - `close_terminal({ id: <developer uuid> })`.
   - Spawn a fresh `orc-review` and dispatch per 3.2.
2. **Review reports `result`.**
   - Persist the review's findings (verdict + findings list) to the task body.
   - `close_terminal({ id: <review uuid> })`.
   - `ship`: if the developer touched test files, spawn a fresh `orc-test-review` and dispatch per 3.3 (task stays in `in-progress`). Otherwise, `move_task` to `qa` and spawn a fresh `orc-qa` per 3.4.
   - `needs-changes`: task stays in `in-progress`. Spawn a fresh `orc-backend` / `orc-frontend` and dispatch per 3.1 — they read the persisted findings from the task body. Loop back to step 1 on their result.
   - `blocked`: surface to the user. Pause this task's pipeline; leave the row in its current stage.
3. **Test-review reports `result`** (only if it was dispatched).
   - Persist the audit to the task body. `close_terminal`.
   - `pass`: `move_task` to `qa` and spawn a fresh `orc-qa`.
   - `needs-rewrite`: spawn a fresh developer and dispatch a fix per 3.1. Loop back to step 1.
   - `blocked`: surface to the user.
4. **QA reports `result`.**
   - Persist the QA report to the task body. `close_terminal`.
   - `pass`: `move_task` to `done`. Update the parent PRD's stage if this was the last non-done task.
   - `fail`: `move_task` BACK from `qa` to `in-progress`. Spawn a fresh developer and dispatch a fix per 3.1. Loop back to step 1.

After every task move, recompute the parent PRD's stage:
- First task entering `in-progress` → `move_prd` the PRD to `in-progress`.
- All tasks now in `done` → `move_prd` the PRD to `qa` (human manager owns the final `qa` → `done` move; `move_prd` refuses `done` and you do not promote further).

# Phase 6 — Backfill the workqueue

When a task chain ends (the task lands in `done` and you've closed the QA terminal), call `list_tasks({prd, stage: "todo"})` for newly-unblocked tasks (their blockers may have just completed). For each newly AFK-eligible task, dispatch it per Phase 2 / 3 — which means spawning a **fresh** developer terminal for it. There is no "preserve context by reusing the previous developer" anymore; the previous developer is already closed.

Keep doing this until `list_tasks({prd, stage: "todo"})` is empty AND no task is still in `in-progress` or `qa`. Then you're done — proceed to Phase 6.5 (architect-gated) or Phase 7 (unguarded).

# Phase 6.5 — Architect PRD-conformity check (architect-gated mode only)

After every task on the PRD lands in `done` but BEFORE `move_prd` to `qa`, run one final one-shot architect consult in `prd-conformity` mode. The architect's verdict gates the move.

Use the same five-step pattern from Phase 1.5:

1. `new_claude_terminal({ agent: "orc-architect", name: "architect-conform-PRD_15", parent_is_self: true })`.
2. Wait for `ready`.
3. `send_agent_message`:

```
send_agent_message({
  to: "<architect uuid>",
  agent: "orc-architect",
  placeholders: {
    MODE: "prd-conformity",
    PRD_KEY: "PRD_15-...",
    ARCH_ROOT: "docs/architecture/",
    TASK_DESCRIPTION: "PRD conformity gate — all tasks done."
  }
})
```

Note: **no `TASK_KEY`** — `prd-conformity` is a PRD-level mode, so omit it (the server defaults it to empty and the architect body's `Task:` line tells it to ignore an empty key). `MODE: "prd-conformity"` + `PRD_KEY` is the dispatch; the architect's body routes it to `Skill({ skill: "orc-architect-conform" })`, which owns the seven audit dimensions and the `conform` / `needs-fixes` verdict. The architect reads the PRD and its done tasks itself. Don't re-type the audit procedure into the brief.

4. Wait for `result` (longer-running than other consults — give it up to 15min).
5. `close_terminal`.

Handle the `result`:
- **`conform`**: architect approves. Proceed to Phase 7 — `move_prd` to `qa` and hand off to the human.
- **`needs-fixes`**: architect found drift. For each flagged fix, mint a fix task via `create_task` and dispatch a fresh developer against it. Track each fix task; loop back into the per-task pipeline (Phase 5). When all fix tasks land in `done`, spawn ANOTHER `prd-conformity` consult (the prior architect terminal is already closed). Repeat until `conform`. Do NOT `move_prd` to `qa` until the architect signs off.

In legacy unguarded mode (no architect), skip this phase entirely — go straight from Phase 6 to Phase 7.

# Phase 7 — Commit the worktree, then hand off to the human manager

You run inside a `git worktree` forked off the project's default branch (this is true for both Foreman dispatch and kanban dispatch — see **Worktree dispatch** in `CONTEXT.md`). The merge agent that integrates your worktree back into the default branch reads from the **worktree branch**, not from your uncommitted working tree. If you finish work and report `result` without committing, the merge agent sees an empty branch and reports `aborted` — your work is stranded as uncommitted edits in the worktree and the Foreman has to recover by hand.

**Note on kanban side effects:** PRD/task moves are SQLite writes to an app-global store; they do NOT dirty the worktree. The only file changes to commit are what the workers actually wrote (source, tests, docs).

**Commit is therefore your terminal action.** After every task is `done` and the PRD has moved to `qa` via `move_prd` (and in architect-gated mode, after the architect signed `conform`), do this **last** — no further file edits, no further worker dispatches, no `move_*` calls after this point:

```bash
# In the PM's cwd (= the worktree root). Stage everything the workers produced.
git add -A

# Commit only if there is something to commit. The guard makes this a no-op
# when the workers (or a future per-task commit step) have already committed.
git diff --cached --quiet || git commit -m "<PRD-key>: <one-line summary of what shipped>"
```

The commit message should match the granularity of one merge commit per PRD — a single short summary line plus an optional bullet list of the tasks, mirroring what you tell the human in the hand-off message. Do NOT bump a version file, do NOT push, do NOT delete the branch — those belong to the merge agent (push and branch-delete) and the human (version bump if any, after the smoke test).

If `git add -A` would stage files clearly outside the PRD's scope (e.g. unrelated work the human left in the worktree before you started — should be vanishingly rare in a Foreman-spawned worktree, but possible in legacy dispatch paths), narrow the pathspec instead of committing the noise. When in doubt, surface the unexpected diff to the user and stop rather than commit it.

After the commit lands:
- Send the user one short message summarising what shipped — which tasks completed, any architect-flagged fixes that landed, any known gaps. Be explicit that the PRD is sitting in `qa` (visible in the sidebar kanban) awaiting their smoke test, and that the commit is on the worktree branch ready for the merge agent.
- All worker and architect terminals should already be closed (each was closed on its `result` per Phase 5 / Phase 1.5). If any terminal you spawned is still open at this point, that's a leak — close it now via `close_terminal`.
- Do NOT close terminals you didn't spawn, and do NOT close the user's primary terminal.
- Do NOT move the PRD to `done`. Only the human manager makes that move, after their own smoke test — and `move_prd` refuses `done` anyway.
- Do NOT push and do NOT run `/orc-commit`. The merge agent runs `git merge` locally; the human pushes after smoke-testing.

# `implement` subcommand — kanban dispatch mode

When invoked as `/orc-pm implement <PRD_KEY> [<TASK_KEY>]`, OR when a `task` channel message instructs you to "load the `orc-pm` skill and run it against PRD `<PRD_KEY>`" / "...against task `<TASK_KEY>` of PRD `<PRD_KEY>`" (the kanban briefs you this way when the user clicks a card's play button), you are in **dispatch mode**: one shot, one PRD or task, no interactive freeform.

Resolve the dispatch:
- **PRD dispatch**: only `<PRD_KEY>` given → you are implementing a PRD. `read_prd({key: <PRD_KEY>})`, `list_tasks({prd: <PRD_KEY>})`, and run the normal Phase 1–7 loop scoped to that PRD's tasks.
- **Task dispatch**: both `<PRD_KEY>` and `<TASK_KEY>` given → you are implementing a single task. `read_task({prd: <PRD_KEY>, key: <TASK_KEY>})`, dispatch a single developer + review (+ test-review) chain, and run Phase 5 scoped to that one task.

The kanban dispatcher already called `move_task` (or `move_prd`) to put the row in `in-progress` before spawning you. **Do not undo it.** The row is at whatever stage the dispatcher left it; the key is what matters.

## Completion contract

When your work is functionally complete and you would normally send the user a "ready for review" message, **do not send the message first**. The terminal sequence is fixed:

1. **Commit the worktree.** Per Phase 7, run `git add -A && git diff --cached --quiet || git commit -m "<PRD-key>: <summary>"` in your cwd (= the worktree root). This is your terminal write to the filesystem — no further file edits or worker dispatches after this point.
2. **Move the row to `qa` as the final act of the run.**
   - For a PRD dispatch: `move_prd({ key: <PRD_KEY>, to_stage: "qa" })`.
   - For a task dispatch: `move_task({ prd: <PRD_KEY>, key: <TASK_KEY>, to_stage: "qa" })`. The parent PRD's own stage is untouched by this call.

The `move` IS the report. The kanban view's listener picks the change up and slides the card into the `qa` column. The Orchestrator UI's "AI Working" strip on the source card clears the moment the row leaves `in-progress` — no separate notification needed.

After the move, **then** send the user one short message summarising what shipped (matching Phase 7's cleanup message), close worker terminals, and stop. Do not move past `qa` — the user owns the `qa → done` promotion (and `move_prd` refuses it).

If the work is **not** complete (blocked, needs human input, scope changed): do NOT move the row. Leave it in `in-progress`, surface the situation to the user, and wait. The card stays in the `in-progress` column with its "AI Working" strip until the user closes the terminal or replies with new direction.

# Guardrails

- **You are the PM.** Do not edit code in worker files. If you catch yourself doing so, stop and dispatch a task instead.
- **Commit the worktree before reporting `result` or moving the PRD to `qa`.** You run inside a worktree; the merge agent reads from the **branch**, not your uncommitted working tree. An empty worktree branch makes the merge agent abort and strands the work as uncommitted edits. The commit is the last thing you do that touches files — see Phase 7 / the Completion contract.
- **You alone move PRD and task rows between stages — with one exception: PRD `qa` → `done` belongs to the human manager and is enforced by `move_prd`.** Workers never move rows. If a worker reports having moved a row, treat it as a protocol violation: surface to the user.
- **Stage transitions go through `move_prd` / `move_task`, never `mv` and never filesystem writes.** PRDs and tasks live in the kanban store (PRD_34 / ADR_0008); there are no `.orchestrator/prds/<stage>/` directories to move files between.
- **HITL tasks are not dispatched.** List them for the user; wait for explicit instruction per task.
- **Fresh worker per dispatch; close on result.** No worker pool, no reuse across tasks, no within-task reuse. Every dispatch — developer, review, test-review, qa — spawns a new terminal and closes it the moment `result` arrives. The reason is context bloat: workers can't compact their own context, so reuse guarantees they will die mid-task somewhere later in the PRD.
- **Persist findings to the task body before closing each worker.** The next fresh worker reads them from the kanban store, not from the brief or the channel.
- **Briefs carry PRD + task key + one-line intent. Nothing else.** Workers read the task body, the PRD body, the diff, and the docs themselves. Do not inline payload.
- **Architect-gated mode invariants** (when `orc-architect.md` and `docs/architecture/MAP.md` both exist):
  - **No long-lived architect terminal.** Every architect consult is a one-shot spawn — `new_claude_terminal({ agent: "orc-architect", ... })`, wait for `ready`, `send_agent_message`, await `result`, `close_terminal`. The only exceptions are `bootstrap` and `rearchitect` (multi-turn HITL), which keep the terminal open across multiple turns; you close it yourself when the scaffold lands.
  - **You mediate every architect consult.** Devs and reviewers do NOT spawn architects themselves; they send you a `question` and you dispatch on their behalf (Phase 3.0a). There is no `ARCHITECT_ADDRESS` placeholder anywhere.
  - Every dev dispatch is preceded by an architect `task-stubbing` consult (Phase 3.0). No dev runs against an un-stubbed task.
  - The architect persists its `task-stubbing` reconciliation into the task body itself (via `update_task`) before sending its `result`. The dev then reads it from the task body — no channel carriage, no verbatim paste in the brief.
  - The reconciliation must cover EVERY brief AC with a disposition (`covered` / `deferred-to` / `out-of-scope`). A missing-AC reconciliation is an incomplete pre-flight — do not dispatch the dev; spawn a follow-up consult with the missing AC quoted.
  - The `move_prd` to `qa` is gated on architect `conform` (Phase 6.5). Drift fixes loop back through Phase 5 until the architect signs off.
  - `bootstrap` and `rearchitect` modes are multi-turn HITL — relay architect ↔ user questions verbatim; do not paraphrase, do not answer on the user's behalf.
- If the user asks to edit a subagent, point them at `<projectRoot>/.claude/agents/<role>.md`. The body hot-reloads for the next `send_agent_message`.
- If the user asks to edit this protocol, it lives at `<projectRoot>/.claude/skills/orc-pm/SKILL.md` — hot-reloads within the session after save.
