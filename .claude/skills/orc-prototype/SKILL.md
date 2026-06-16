---
description: Build a throwaway prototype to flesh out a design before committing to it. Routes between two branches — a runnable terminal app for state / business-logic questions, or several radically different UI variations toggleable from one route.
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

- **"Does this logic / state model feel right?"** → **Logic prototype**. Build a tiny interactive terminal app (or in this repo: a small SwiftUI / AppKit harness window, or a `swift run` CLI target) that pushes the state machine through cases that are hard to reason about on paper.
- **"What should this look like?"** → **UI prototype**. Generate several radically different UI variations on a single route, switchable via a URL search param + floating bottom bar (web), or via a `Picker` + ephemeral `@State` variant index (SwiftUI).

The two branches produce very different artifacts — getting this wrong wastes the whole prototype. If the question is genuinely ambiguous and the user isn't reachable, default to whichever branch better matches the surrounding code (a backend / core module → logic; a page or component / view → UI) and state the assumption at the top of the prototype.

# Step 2 — Rules that apply to both branches

1. **Throwaway from day one, and clearly marked as such.** Locate the prototype code close to where it will actually be used (next to the module or view it's prototyping for) so context is obvious — but name it so a casual reader can see it's a prototype, not production. Suggested naming: `*_Prototype.swift`, `PrototypeFoo.tsx`, or a folder ending in `-prototype/`. In this repo's Swift sources, a sensible home is `Sources/DesignLab/<feature>Prototype/`; for web prototypes, follow the project's existing routing convention — don't invent a new top-level structure.
2. **One command to run.** Use the project's existing task runner — `swift run <target>`, `pnpm <name>`, `python <path>`, etc. The user must be able to start it without thinking. If the prototype is a new Swift target, add it to `Package.swift`; if it's a script, add a Make target or `pnpm` script.
3. **No persistence by default.** State lives in memory. Persistence is the thing the prototype is *checking*, not something it should depend on. If the question explicitly involves a database / `state.json` / disk format, hit a scratch path with a clear `PROTOTYPE — wipe me` name; never write into the real `~/Library/Application Support/Orchestrator/state.json`.
4. **Skip the polish.** No tests, no error handling beyond what makes the prototype *runnable*, no abstractions. The point is to learn something fast and then absorb the answer.
5. **Surface the state.** After every action (logic) or on every variant switch (UI), print or render the full relevant state so the user can see what changed. For SwiftUI prototypes that means a debug overlay or an inspector pane; for terminal prototypes, clear-screen + reprint.
6. **Keep the winning variant; prune the losers.** When a UI prototype has multiple variants, delete the losing variants once a winner is picked. **Keep the winning variant in the repo as a reference artifact** — do NOT delete it just because the production version has shipped. The winner carries the verdict, the design history, and the closest-to-runnable demo of the validated decision. Only delete a winning prototype when the user explicitly says so. The logic-prototype version of this rule: lift the validated *pure module* into production and keep the throwaway harness around for future reference, removing only its production mounting (e.g. the DesignLab route that exposed it during dogfood). **The upstream `mattpocock/skills` skill says "delete the prototype when done" — this project deliberately overrides that rule.**

# Step 3a — Logic prototype

A logic prototype is a lightweight interactive harness for testing business logic, state transitions, and data models before full implementation.

Process:

- **Question first.** Document, in one paragraph at the top of the prototype file, what state model and which question you're prototyping. Future-you (or the user) needs this to read the prototype later.
- **Language choice.** Use the host project's existing language and tooling rather than introducing new dependencies. In this repo that almost always means Swift (a new `swift run` target under `Sources/DesignLab/` or a small CLI target). For a web-side prototype, match the surrounding stack.
- **Isolate logic.** Put the actual logic — the bit that's answering the question — behind a small, pure interface that could be lifted out and dropped into the real codebase later. The harness is throwaway; the logic module is the deliverable.
- **Minimal harness.** A screen-clearing terminal loop or a single SwiftUI window showing the current state (bold field names, dim context) followed by keyboard shortcuts / buttons at the bottom. No menus, no settings.
- **Single command.** Add a script to the project's task runner so users run something like `swift run <PrototypeName>` or `pnpm run prototype:<name>`.

Anti-patterns to avoid:

- Don't add tests — that signals the prototype has outlived its purpose.
- Don't connect to real databases / persisted state files; use in-memory state.
- Don't blur logic and UI together; keep the reducer / state machine pure.
- Don't ship the harness shell to production — only preserve the validated logic module.

The prototype succeeds when the user discovers what "feels wrong" about an idea. Those moments are the deliverable.

# Step 3b — UI prototype

A UI prototype rapidly tests multiple design directions on a single route / view using a switcher to flip between variants.

Sub-shape A (preferred): Variants live on an existing page / view, controlled via `?variant=` (web) or an ephemeral `@State` index (SwiftUI). This keeps the design grounded in real context — actual data, headers, density.

Sub-shape B (fallback): A temporary route / preview window houses variants when no logical existing page exists. **Be emphatic about this:** an empty route hides design problems that a populated one would expose. If you must go this route, seed the variants with realistic mock data.

Process (6 steps):

1. **Define scope.** Typically three variants maximum, with a one-line summary of the intent behind each.
2. **Build variants.** Structurally distinct designs (not color swaps), each with clear component names — e.g. `SidebarLibraryZone_StackedLists`, `SidebarLibraryZone_TabBar`, `SidebarLibraryZone_GroupedDisclosure`. The structural difference is the whole point.
3. **Switcher logic.** Conditional rendering based on the URL parameter (web) or a `Picker`-driven enum (SwiftUI).
4. **Floating control bar.** Bottom-center pill with navigation arrows and labels (web), hidden in production builds — or a translucent `HStack` overlay (SwiftUI). The user must be able to flip between variants without typing anything.
5. **Share.** Hand the user the URL / build command. They interact with each variant to identify preferences.
6. **Consolidate and clean.** Delete the losing variants and remove the switcher code once a winner is picked. The validated variant gets folded into production.

Constraints / pitfalls:

- Variants that differ only cosmetically aren't worth prototyping — pick three substantially different structures.
- Don't pull every variant into a shared component "to avoid duplication" — variants are supposed to rot. Duplication here is correct.
- **No real mutations.** The prototype is read-only against real state. Any "delete" / "save" button should be a no-op or write to a scratch dict.
- Don't promote unpolished prototype code directly to production. The validated variant gets a rewrite pass when it lands in real code.

# Step 4 — When done

The *answer* is what matters; the prototype is only the artifact that produced it. Capture the verdict somewhere durable along with the question it was answering:

- A line in the relevant PRD's Implementation Decisions section (preferred when a PRD exists).
- An ADR (`docs/adr/<n>-<topic>.md`) if the project keeps one.
- A commit message on the prune-the-losers commit.
- A short `NOTES.md` next to the prototype.

**Disposition of the prototype itself (this project's convention):**

- **Losing variants** of a UI prototype: delete them once the winner is picked. They're noise.
- **Winning variant** of a UI prototype: KEEP it in the repo as a reference artifact. Remove only its production mounting (the DesignLab route or feature flag that exposed it during dogfood) so users don't reach the prototype version in normal workflows. The source stays.
- **Logic prototype**: lift the validated pure module into production. Keep the throwaway harness around as a reference; remove only its task-runner entry (the `swift run` target, `pnpm` script) so it isn't accidentally launched in production.
- **Unanswered prototype**: a prototype that lingers without an answer is worse than no prototype at all — it implies a decision was made when none was. Either drive the question to a verdict or delete the whole thing.

Only delete a winning prototype when the user explicitly asks. The upstream `mattpocock/skills` version of this skill says "delete the prototype when done"; this project deliberately overrides that rule because winning prototypes have proven repeatedly useful as design history.

# Step 5 — Report

One or two sentences:

- Which branch you took (logic / UI) and why.
- The path to the prototype + the one-command to run it.
- The specific question the prototype is answering.

Nothing else. The prototype is the artifact.
