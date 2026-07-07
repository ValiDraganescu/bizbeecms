---
description: Build a throwaway prototype to flesh out a design before committing to it — a runnable terminal/harness app for state and business-logic questions, or several radically different UI variations toggleable on one route. Use when the user wants to prototype, spike, or compare design directions before building for real.
argument-hint: "[what you want to prototype]"
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
---

A prototype is **throwaway code that answers a question**. The question decides the shape.

Adapted from [`prototype`](https://github.com/mattpocock/skills). The split between a logic prototype and a UI prototype is preserved; the rules below tailor both to this repo's conventions.

The user invoked `/orc-prototype` with the following argument (may be empty):

```
$ARGUMENTS
```

If empty, ask the user — in one short message — what they want to prototype and which branch (logic / UI) they think fits. Wait for their reply.

# Step 1 — Pick the branch

Identify which question is being answered, from `$ARGUMENTS`, the surrounding code, or by asking if the user is around:

- **"Does this logic / state model feel right?"** → **Logic prototype**: a tiny interactive terminal app (or in this repo: a small SwiftUI/AppKit harness window, or a `swift run` CLI target) that pushes the state machine through cases that are hard to reason about on paper.
- **"What should this look like?"** → **UI prototype**: several radically different UI variations on a single route, switchable via a URL search param + floating bottom bar (web) or a `Picker` + ephemeral `@State` variant index (SwiftUI).

The two branches produce very different artifacts — getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (backend / core module → logic; page / component / view → UI) and state the assumption at the top of the prototype.

# Step 2 — Rules for both branches

1. **Throwaway from day one, and clearly marked.** Locate the code close to where it will actually be used, named so a casual reader sees it's a prototype: `*_Prototype.swift`, `PrototypeFoo.tsx`, or a `-prototype/` folder. In this repo's Swift sources a sensible home is `Sources/DesignLab/<feature>Prototype/`; for web, follow the project's existing routing convention.
2. **One command to run.** Use the project's existing task runner — `swift run <target>`, `pnpm <name>`, `python <path>`. A new Swift target goes in `Package.swift`; a script gets a Make target or `pnpm` script. The user starts it without thinking.
3. **No persistence by default.** State lives in memory — persistence is usually the thing being *checked*, not a dependency. When the question explicitly involves a database / `state.json` / disk format, hit a scratch path with a clear `PROTOTYPE — wipe me` name; the real `~/Library/Application Support/Orchestrator/state.json` stays untouched.
4. **Skip the polish.** No tests, no error handling beyond what makes it runnable, no abstractions. Learn fast, absorb the answer.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state: a debug overlay or inspector pane in SwiftUI, clear-screen + reprint in a terminal.
6. **Disposition is decided in Step 4** — winners are kept, losers pruned; read it before deleting anything.

# Step 3a — Logic prototype

A lightweight interactive harness for testing business logic, state transitions, and data models before full implementation.

- **Question first.** One paragraph at the top of the prototype file: what state model, what question. Future readers need it.
- **Language choice.** The host project's existing language and tooling — in this repo, almost always Swift (a `swift run` target under `Sources/DesignLab/`); for web, the surrounding stack.
- **Isolate logic.** The bit answering the question lives behind a small, **pure** interface — a reducer/state machine with no UI mixed in — that can be lifted into the real codebase later. The harness is throwaway; the logic module is the deliverable.
- **Minimal harness.** A screen-clearing terminal loop or a single window showing current state (bold field names, dim context) with shortcuts/buttons at the bottom. No menus, no settings.
- **Single command.** Wire it into the task runner: `swift run <PrototypeName>` / `pnpm run prototype:<name>`.

The prototype succeeds when the user discovers what "feels wrong" about an idea. Those moments are the deliverable.

# Step 3b — UI prototype

Rapidly test multiple design directions on a single route / view with a switcher.

Sub-shape A (preferred): variants live on an **existing** page / view, controlled via `?variant=` (web) or an ephemeral `@State` index (SwiftUI) — grounded in real context: actual data, headers, density.

Sub-shape B (fallback): a temporary route / preview window, only when no logical existing page exists — and then seeded with realistic mock data, emphatically: an empty route hides design problems a populated one exposes.

Process:

1. **Define scope.** Three variants maximum, one line of intent each.
2. **Build variants.** Structurally distinct designs — different layouts and hierarchies, where color swaps would answer nothing — with clear names: `SidebarLibraryZone_StackedLists`, `SidebarLibraryZone_TabBar`, `SidebarLibraryZone_GroupedDisclosure`.
3. **Switcher logic.** Conditional rendering off the URL param (web) or a `Picker`-driven enum (SwiftUI).
4. **Floating control bar.** Bottom-center pill with arrows and labels (web, hidden in production builds) or a translucent `HStack` overlay (SwiftUI) — the user flips variants without typing.
5. **Share.** Hand over the URL / build command; the user interacts with each variant.
6. **Consolidate.** Once a winner is picked, remove the switcher code and apply the Step 4 disposition.

Guardrails:
- **Variants stay duplicated** — they're supposed to rot, so copy-paste between them is correct; a shared component would couple designs that exist to diverge.
- **No real mutations.** The prototype is read-only against real state; any "delete"/"save" button is a no-op or writes to a scratch dict.
- The validated variant gets a **rewrite pass** when it lands in real code — prototype polish standards (rule 4) are below production's.

# Step 4 — When done: verdict + disposition

The *answer* is what matters; the prototype is only the artifact that produced it. Capture the verdict durably, with the question it answered: an ADR (`docs/adr/<n>-<topic>.md`) if the project keeps them, the prune-the-losers commit message, or a short `NOTES.md` next to the prototype.

**Disposition (this project's convention — deliberately overrides upstream's "delete the prototype when done"):**

- **Losing UI variants**: delete once the winner is picked. They're noise.
- **Winning UI variant**: KEEP in the repo as a reference artifact — it carries the verdict, the design history, and the closest-to-runnable demo of the validated decision. Remove only its production mounting (the DesignLab route or feature flag) so users don't reach it in normal workflows. Deleting a winner takes an explicit user request.
- **Logic prototype**: lift the validated pure module into production; keep the throwaway harness as a reference, removing only its task-runner entry so it isn't launched by accident.
- **Unanswered prototype**: worse than none — it implies a decision that was never made. Drive the question to a verdict or delete the whole thing.

# Step 5 — Report

One or two sentences: which branch (logic / UI) and why, the prototype path + the one command to run it, and the specific question it answers. Nothing else — the prototype is the artifact.
