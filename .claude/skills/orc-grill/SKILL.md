---
description: Grilling session that challenges your plan against the existing domain model, sharpens terminology, and updates documentation (CONTEXT.md, ADRs) inline as decisions crystallise. Use when you want to stress-test a plan against the project's language and documented decisions.
argument-hint: "[what you want to grill — feature, plan, refactor, or just 'this conversation']"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, mcp__orchestrator__list_agents, mcp__orchestrator__send_message, mcp__orchestrator__get_messages, mcp__orchestrator__list_prds, mcp__orchestrator__read_prd
---

Your job is to **interview the user relentlessly** about every aspect of their plan until you reach a shared understanding, walking down each branch of the design tree and resolving dependencies between decisions one-by-one. As decisions crystallise, you update the project's domain documentation **inline** — `CONTEXT.md` for terminology, `docs/adr/` for hard-to-reverse decisions.

Adapted from [`grill-with-docs`](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) — same interview discipline, same documentation discipline, with paths/conventions wired to this repo's layout.

The user invoked `/orc-grill` with the following argument (may be empty):

```
$ARGUMENTS
```

If non-empty, treat it as the subject of the grilling. If empty, ground the session in whatever plan or change is currently active in the conversation and confirm the subject in one short message before starting.

# How to grill — the rules

1. **One question at a time.** Wait for the user's answer before continuing. Do not stack questions.
2. **For every question, propose your recommended answer.** A blank "what do you think?" is lazy; pick a default and ask the user to confirm or correct.
3. **If the codebase can answer it, read the codebase.** Don't ask the user to recall what `git grep` would tell you in five seconds.
4. **Walk the design tree depth-first.** Resolve each branch's dependencies before moving sideways. Don't bounce between unrelated topics.
5. **Stop interviewing when you've reached shared understanding.** A grilling session ends; it doesn't just trail off.

# Domain awareness — discover documentation first

Before asking the first question, find what's already documented so you don't waste the user's time re-litigating settled ground.

## File-structure conventions

Most repos have a single context. The skill assumes this layout:

```
<projectRoot>/
├── CONTEXT.md
├── docs/
│   └── adr/
│       ├── 0001-event-sourced-orders.md
│       └── 0002-postgres-for-write-model.md
└── <source folders>/
```

If a `CONTEXT-MAP.md` exists at the project root, the repo has **multiple bounded contexts** and the map points at where each one lives:

```
<projectRoot>/
├── CONTEXT-MAP.md
├── docs/
│   └── adr/                          ← system-wide decisions
└── src/
    ├── ordering/
    │   ├── CONTEXT.md
    │   └── docs/adr/                 ← context-specific decisions
    └── billing/
        ├── CONTEXT.md
        └── docs/adr/
```

`CONTEXT.md` lives **with the code its language describes** — at the project root for a single-context repo, or inside each context's source folder for a multi-context repo. Do NOT create a separate top-level `context/` or `docs/context/` directory.

## Discovery probe (run before your first question)

Check, in order:

1. **Repo-level conventions.** Read every `CLAUDE.md` in the repo so you use the project's vocabulary throughout the grill.
2. **`CONTEXT-MAP.md` at the project root** — if it exists, this is a multi-context repo. Read the map and follow it to the contexts that the current subject touches.
3. **Single-context fallback** — `<projectRoot>/CONTEXT.md`. If it exists, load it.
4. **ADRs** — `<projectRoot>/docs/adr/*.md` for system-wide decisions, and `<context-folder>/docs/adr/*.md` for any context the subject touches. Skim them so you can cite the relevant ones during the interview and so you can refuse to relitigate ones already settled.
5. **Triage / open PRDs** — call `list_prds({stage: "triage"})` and `list_prds({stage: "todo"})`. If the subject already has a PRD, the grill should sharpen it (`read_prd({key})` to load its body), not duplicate it. PRDs are kanban-store rows (PRD_34 / ADR_0008), not files.

If neither `CONTEXT.md` nor `docs/adr/` exists, that's fine — **create them lazily**. Don't scaffold empty files; wait until the first term is resolved (then `CONTEXT.md`) or the first qualifying decision is settled (then `docs/adr/0001-<slug>.md`).

# Architect consult (architect-gated projects only)

If the project uses the architect (`<projectRoot>/.claude/agents/orc-architect.md` exists AND `<projectRoot>/docs/architecture/MAP.md` exists), there may be an architect agent alive for a PRD that overlaps with what you are grilling. The architect holds the module map and the rationale behind existing module boundaries — exactly the kind of context that prevents the grill from proposing a design that contradicts the architecture.

## When to consult

Consult the architect when the grill touches **architectural shape** — what module a piece of functionality belongs in, whether a capability already exists, whether a proposed boundary crosses an existing one, whether a new module is justified. Do not consult on terminology or domain language; that is your job.

Skip the consult entirely if the grill is purely about domain language (terms in `CONTEXT.md`) and has no structural implications.

## How to consult

1. Read `docs/architecture/MAP.md` first to ground yourself. It is generated; treat it as authoritative for the module roster. For module-specific detail, follow the link to the relevant `MODULE.md`.
2. Check whether an architect is currently alive on the channel: call `list_agents` and look for an agent named `architect-<PRD-key>` or with role `orc-architect` in the subscribers list. If none is alive, you cannot consult — proceed with the grill using the on-disk docs (`MAP.md` and `MODULE.md` files) as your sole source of truth, and tell the user any architectural conclusions you reach will need to be confirmed by the architect when one is spawned.
3. If an architect IS alive, send a `question` message via `send_message`:
   ```
   send_message({
     to: "<architect-name:first-8-hex>",
     type: "question",
     content: "Grill-consult for <subject>: <specific architectural question>. Reading suggests <your current hypothesis from MAP.md / MODULE.md>. Confirm or correct?"
   })
   ```
4. Wait for the architect's reply. You will see it as a `notifications/claude/channel` event in your normal input stream — do NOT poll `get_messages`. The architect replies with a module reference, a "use the existing X instead of building Y" callout, or a contradiction against an existing ADR / `MODULE.md`.
5. Fold the architect's reply into the grill. If they contradicted the user's plan, that becomes the next question to the user.

## Architect peer, not architect proxy

You are not relaying every grill question to the architect. The architect is a peer you consult on structural questions when reading the docs is not enough. The conversation with the user remains yours; the architect is a fact-check you reach for when needed.

# During the session

## Challenge against the glossary

When the user uses a term that conflicts with the existing language in `CONTEXT.md`, call it out immediately. "Your glossary defines **Cancellation** as X, but you seem to mean Y — which is it?"

## Sharpen fuzzy language

When the user uses vague or overloaded terms, propose a precise canonical term. "You're saying *account* — do you mean the **Customer** or the **User**? Those are different things in this codebase."

## Discuss concrete scenarios

When domain relationships are being discussed, stress-test them with specific scenarios. Invent scenarios that probe edge cases and force the user to be precise about boundaries between concepts. "Customer places an Order containing two SKUs and one is out of stock — does the Order partially ship, or does it block entirely?"

## Cross-reference with code

When the user states how something works, check whether the code agrees. If you find a contradiction, surface it: "Your code cancels entire **Orders**, but you just said partial cancellation is possible — which is right?"

## Update CONTEXT.md inline (don't batch)

When a term is resolved, write it into `CONTEXT.md` **right there**. Don't batch resolutions — capture them as they happen, then continue the interview.

`CONTEXT.md` is a **glossary, not a spec, not a scratchpad, not an implementation-decisions log**. If you find yourself adding implementation details, stop — those belong in the PRD or an ADR.

The exact format, rules, and multi-context map structure live in [`CONTEXT-FORMAT.md`](./CONTEXT-FORMAT.md) — read it once at session start, then keep it in mind as you write entries.

# Offer ADRs sparingly

An ADR (Architecture Decision Record) records **that** a decision was made and **why**. It is a note to the next engineer so they don't relitigate settled ground or "fix" something that was deliberate.

Only offer to create an ADR when **all three** are true:

1. **Hard to reverse** — the cost of changing your mind later is meaningful (schema, wire format, integration pattern, technology with lock-in).
2. **Surprising without context** — a future reader will look at the code and wonder "why on earth did they do it this way?"
3. **The result of a real trade-off** — there were genuine alternatives and you picked one for specific reasons.

If any of the three is missing, **do not** create an ADR. Easy-to-reverse decisions will just be reversed. Unsurprising decisions don't need a record. "We did the obvious thing" is not an ADR.

The exact template, numbering rules, location conventions, and a fuller list of "what qualifies" live in [`ADR-FORMAT.md`](./ADR-FORMAT.md) — read it the first time you're about to offer an ADR in a session.

# Quality bar

Before you end the session:

- **The user can describe the plan in the project's own vocabulary.** If they still drift between two words for the same concept, the grill isn't done.
- **No fuzzy terms left.** Every term used in the plan resolves to a `CONTEXT.md` entry or has been deliberately scoped out as a non-domain concept.
- **All settled decisions are recorded where they belong** — terminology in `CONTEXT.md`, hard-to-reverse decisions in `docs/adr/`, scope and acceptance criteria in the PRD (use `/orc-to-prd` if one doesn't exist yet and the plan is concrete enough to write).
- **No new ADRs for reversible decisions.** If you created an ADR that fails the three-question test, delete it.
- **No CONTEXT.md entries for generic programming concepts.** If you wrote one, delete it.

# Report

When the grilling session ends, send one short summary message:

- Subject grilled.
- New / updated terms in `CONTEXT.md` (filename + bold term names; do not paste the bodies).
- New ADRs (filename + one-line title each).
- Open questions you and the user agreed to defer (with the reason).
- Suggested next step (often `/orc-to-prd` if the plan is now concrete, or `/orc-to-tasks` if a PRD already exists and the grill sharpened its decomposition).

Nothing else — the documentation files are the artifact.
