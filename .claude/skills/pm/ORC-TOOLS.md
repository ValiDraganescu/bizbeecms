# Orchestrator dispatch — cadence and guardrails

Mechanics for driving worker terminals. Lessons here were paid for by real desynced runs (meeseeks/foreman era) — treat the guardrails as hard.

## The cadence (per dispatch)

1. **Stamp** — `date '+%Y-%m-%d %H:%M:%S'`; lead your log line with it. Wall-clock anchors let you later judge a quiet worker: minutes of honest work, or wedged.
2. **Summon** — `new_claude_terminal({ name, parent_is_self: true, agent?, model?, cwd? })`. `agent: "<name>"` boots the terminal with `.claude/agents/<name>.md` as its system prompt (identity persists across Orchestrator restarts); omit it for a plain Claude. `cwd` for worktrees. Returns the worker's `uuid` — your handle.
3. **Ready-check** — poll `list_agents` for `has_subscriber: true` on that uuid. Expect ~5–10s; still false after ~20s → `close_terminal` it and summon a replacement.
4. **Brief** — `send_message({ to: uuid, type: "task", content })`, or `send_agent_message` to render an agent file with `{{PLACEHOLDER}}` substitution (delivers brief-only when the terminal already booted as that agent — check `delivery_mode` in the response). Tell the worker where to send its `result`: your session id is in the orchestrator MCP instructions block.
5. **Idle** — the worker's `result` arrives as a channel event that wakes you. Between summon and result you wait; the channel is the loop's only cadence.
6. **React** — verify the claim (see SKILL.md), log one line, close or re-task the worker. `close_terminal` a finished worker promptly — a fresh clean context per task is the design.

## Hard guardrails

- **No timers.** `/loop` and `ScheduleWakeup` race the channel notification — you can wake into recovery logic just as a healthy worker finishes, close it, or summon a duplicate. This desynced a real run. If a worker wedges silently, you simply wait until the channel or the user wakes you, then recover.
- **Workers are sibling terminals, never in-process subagents.** The built-in `Agent` / `Task` tools look equivalent but spawn inside your own process: no terminal in the Orchestrator tree, no channel reachability, no user visibility. Dispatch with `new_claude_terminal`, always.
- **One worker per shared surface.** Two concurrent workers on overlapping files have no lock; serialize, or isolate in worktrees.
- **Nobody pushes.** Workers commit when green; `git push` triggers the CI deploy and belongs to the user.

## Recovery

- **Silent worker** (≥ ~10 min past summon, and you happen to be awake): one `send_message({ type: "question", content: "status check — still working? reply with status or result." })`. Still silent on a later wake → assume wedged: `close_terminal`, re-dispatch the task to a fresh worker; losing uncommitted partial work is acceptable — log it.
- **Cancel a task** — `cancel_task({ to, task_id, reason })` is a cooperative interrupt; the session stays alive. No ack within ~30s → `close_terminal` (cascade-kills children).
- **Worktree errors** — `create_worktree` returns `{ error, message }` on known failures (`default_branch_unset` / `default_branch_stale` / `worktree_create_failed`); check for `error` before using the result. Success returns `worktree_path` ready for `new_claude_terminal`'s `cwd`, plus `node_install_prefix` (run it in the worktree before dispatching).

## Reading the human's runs

Run configs under `.orchestrator/runs/` are started only by the human clicking Run — but you can read them: `tail_run_output({ name, lines })` and `search_run_output({ pattern, name?, regex? })` (10k-line buffer). Use them to verify behavior against the live dev server instead of asking the user what they see. `create_run` / `update_run` let you define a config for the human to click.
