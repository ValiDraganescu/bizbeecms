---
description: Retrieve x.com Threads and other Captures from the user's Knowledge base via the knowledge_* MCP tools. Use when the user references something "saved" or "bookmarked" or asks the agent to recall material from x.com.
argument-hint: "[topical query]"
allowed-tools: mcp__orchestrator__knowledge_search, mcp__orchestrator__knowledge_get, mcp__orchestrator__knowledge_list
---

The user invoked `/orc-recall` with the following argument (may be empty):

```
$ARGUMENTS
```

If non-empty, treat it as the **topical query**: search the Knowledge base, surface what you find, and answer grounded in those Captures. If empty, ask the user what they want to recall before searching — `knowledge_list` is a browse affordance, not a substitute for knowing the topic.

# What the Knowledge base is

An app-global SQLite store of **Captures** the user has saved from x.com via the browser extension's share-menu **"To Orchestrator"** action. v1 ships exactly one **Capture kind** — `x_thread`, an author's self-reply chain rooted at a Head post — but the store is source-pluggable, so read `kind` from responses rather than assuming. It lives outside the project repo (`~/Library/Application Support/Orchestrator/knowledge.sqlite`) and survives project switches and rebuilds. You reach it only through the three MCP tools.

The full domain glossary lives at `Sources/OrchestratorKnowledgeBase/CONTEXT.md` in this repo — read it before guessing at a term mid-conversation.

# Vocabulary

What you'll see in tool responses:

- **Capture** — one stored unit of knowledge: `id` (`xt:<head_post_id>` for a Thread), `kind`, `title`, `source_url`, `captured_at`, `status`, optional `failure_reason`.
- **Capture status** — lifecycle: `fetching` (placeholder stub, X API call in flight, no Posts yet), `ready` (Posts populated, safe to read), `failed` (`failure_reason` carries the message; the stub remains so the user can retry by re-sharing).
- **Thread completeness** (on `ready` Threads): `complete` (Head resolved and the whole tail enumerated within the X API's 7-day `search/recent` window) or `truncated-tail` (captured > 7 days after posting, so later self-replies by the author are unknown — see the caveat policy).
- **Post** — one x.com status inside a Thread: `id`, `ordinal` (0 = Head, ascending chronological), `permalink`, `posted_at`, `body`, `raw_json`, zero-to-many media references.
- **Head** — the Thread's first post (`ordinal: 0`); the Capture's stable identity comes from its id.
- **Permalink** — the canonical `https://x.com/<handle>/status/<id>` URL. Cite it verbatim when grounding an answer — x.com redirects renamed handles, so the stored URL keeps working.

# The three tools

- **`knowledge_search`** `(query, limit=10, cap 200)` — FTS5-ranked lexical search across Capture titles and Post bodies. **The first call for every topical question**, even when you think you know the right Capture id — ranking may surface something better. Pass natural language: FTS5 syntax (`*`, `:`, `AND`, quoted phrases) is sanitized away. Each hit carries the Capture `summary` plus, when the match was in a Post body, `post_id` / `post_permalink` / `post_snippet`; a title-only hit has none of those, so cite the Capture's `source_url` (the Head's permalink).
- **`knowledge_get`** `(record_id)` — the full body of one Capture, by the `xt:…` id from a search hit. `posts` arrive in ordinal order; `media` is omitted when a Post has none; `raw_json` is the original X API tweet object — useful when the user asks about a field the structured columns don't surface (entities, edits, view counts).
- **`knowledge_list`** `(limit=50 cap 500, offset, status?)` — paged browse of all Captures, newest first, summary rows only. For "what have I saved recently?" and "show me everything still fetching" — topical retrieval belongs to `knowledge_search`.

# The canonical retrieval loop

1. **Search.** `knowledge_search(query: <user's topic>, limit: 10)`.
2. **Filter.** Keep only hits whose `summary.status` is `ready` — `fetching` stubs have no Posts yet; a `failed` hit's `failure_reason` is worth mentioning to the user but has no body to cite. Read the survivors' `post_snippet` and `summary.title` to judge which are actually on-topic.
3. **Pick.** The top relevant hit (or top few when the question warrants comparing sources).
4. **Get.** `knowledge_get(record_id: <hit.summary.id>)` for the full Thread.
5. **Cite.** Ground the answer in the Thread's Posts. Quote sparingly; cite each claim back to the Post's `permalink` (or the Head's `source_url` for Thread-level answers) so the user can verify.

Zero hits → say so plainly. The user invoked `/orc-recall` to get an answer grounded in *their* saved material, so anything you add from training data is labeled as such — never silently substituted.

# Caveat policy — `truncated-tail` answers

Any answer derived from a Thread whose `thread.completeness == "truncated-tail"` MUST carry an explicit caveat, worded like:

> (note: this thread was captured > 7 days after posting, so any later replies by the author are not in the Knowledge base.)

The tail-replies may exist on x.com but are unknown to us; the user needs to know the ground-truth is partial before acting on a claim. When you cite several Threads and only some are `truncated-tail`, scope the caveat to those — a fully-`complete` citation stands un-caveated.

# What `/orc-recall` is NOT

- **Not a capture trigger.** This skill retrieves; the user captures Threads from x.com via the browser extension. There is no tool that ingests new URLs from inside the chat.
- **Not a bookmarks importer.** That path runs from Settings → X integration; agents never invoke it.
- **Not an embedding search.** v1 is FTS5 lexical only. A "find posts about a *concept* I can't name" question will miss — say so honestly rather than fabricate matches.

# Composition with other skills

Other skills can mention `/orc-recall` to opt their flow into Knowledge base retrieval — the convention is a line in their body: "If the user references saved material, invoke `/orc-recall` first to ground the answer."

`/orc-grill` deliberately does NOT auto-pull from the Knowledge base — grilling surfaces *what the user thinks*, not preemptive citations. The user can invoke `/orc-recall` themselves mid-grill.
