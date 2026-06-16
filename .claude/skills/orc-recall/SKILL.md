---
description: Retrieve x.com Threads and other Captures from the user's Knowledge base via the knowledge_* MCP tools. Use when the user references something "saved" or "bookmarked" or asks the agent to recall material from x.com.
argument-hint: "[topical query]"
allowed-tools: mcp__orchestrator__knowledge_search, mcp__orchestrator__knowledge_get, mcp__orchestrator__knowledge_list
---

The user invoked `/orc-recall` with the following argument (may be empty):

```
$ARGUMENTS
```

If non-empty, treat it as the **topical query** for the recall — search the Knowledge base, surface what you find, and answer the user's question grounded in those Captures. If empty, ask the user what they want to recall before searching (do NOT call `knowledge_list` to enumerate the whole store — that's a browse affordance, not a search one).

# What the Knowledge base is

An app-global SQLite store of **Captures** the user has saved from x.com via the browser extension's share-menu **"To Orchestrator"** action. v1 ships exactly one **Capture kind** — `x_thread`, an author's self-reply chain rooted at a Head post — but the store is source-pluggable and a future build may add web pages and other kinds. The store lives outside the project repo (under `~/Library/Application Support/Orchestrator/knowledge.sqlite`) so it survives every project switch and every rebuild.

You query it through three MCP tools. You never touch the SQLite file directly.

The full domain glossary lives at `Sources/OrchestratorKnowledgeBase/CONTEXT.md` in this repo if you need to disambiguate a term mid-conversation — read it before guessing.

# Vocabulary

The vocabulary you will see in tool responses:

- **Capture**: one stored unit of knowledge. Carries `id` (`xt:<head_post_id>` for a Thread), `kind`, `title`, `source_url`, `captured_at`, `status`, optional `failure_reason`.
- **Capture kind**: `x_thread` in v1. Future kinds (web pages, etc.) will add new values; do not assume `x_thread` is the only one when reading responses.
- **Capture status**: lifecycle of a Capture. Three values:
  - `fetching` — placeholder stub. The X API call is still in flight. Posts not yet available.
  - `ready` — Posts populated. Safe to read.
  - `failed` — the X API call failed; `failure_reason` carries the message. The stub remains so the user can retry by re-sharing.
- **Thread completeness** (only present on `ready` Threads): how confident the store is that it has the whole Thread.
  - `complete` — Head resolved and the entire tail enumerated within the X API's 7-day `search/recent` window.
  - `truncated-tail` — Head resolved correctly, but the post was captured > 7 days after it was posted, so any later self-replies by the author are unknown.
- **Post**: one x.com status inside a Thread. Has `id`, `ordinal` (0 = Head, ascending chronological), `permalink`, `posted_at`, `body`, `raw_json`, and zero-to-many media references. Each Post stores its own permalink — surface it when you cite the user back.
- **Head**: the first post of a Thread (`ordinal: 0`). The Capture's stable identity comes from the Head's id.
- **Permalink**: the canonical `https://x.com/<handle>/status/<id>` URL back to a Post. Cite this verbatim when grounding an answer — x.com redirects renamed handles, so the stored URL keeps working.

# The three MCP tools

## `mcp__orchestrator__knowledge_search`

**Purpose:** FTS5-ranked lexical search across Capture title and Post body. This is your primary retrieval tool — start here.

**Arguments:**
- `query` (required, string) — free-text query. Whitespace and punctuation are tokenized; FTS5 syntax (`*`, `:`, `AND`, quoted phrases) is sanitized away — pass natural language.
- `limit` (optional, int, default 10) — capped at 200.

**Response shape:**
```
{
  "hits": [
    {
      "summary": { "id": "xt:...", "kind": "x_thread", "title": "...",
                   "source_url": "...", "captured_at": <unix-seconds>,
                   "status": "ready", "completeness": "complete" },
      "post_id": "1804..." ,          // present when the hit was in a Post body
      "post_permalink": "https://x.com/.../status/...",
      "post_snippet": "...[matched fragment]..."
    },
    ...
  ]
}
```

If the hit is on the Capture's title only, `post_id` / `post_permalink` / `post_snippet` are absent — the answer surfaces only the Capture's `source_url` (the Head's permalink).

**When to use:** the user asked about a topic. Always run this first, even if you think you know the right Capture id — search ranks by relevance and may surface something better.

## `mcp__orchestrator__knowledge_get`

**Purpose:** fetch the full body of one Capture by id.

**Arguments:**
- `record_id` (required, string) — the `xt:<head_post_id>` form from a search hit's `summary.id`.

**Response shape:**
```
{
  "record": {
    "id": "xt:...", "kind": "x_thread", "title": "...",
    "source_url": "...", "captured_at": <unix-seconds>, "status": "ready",
    "thread": { "head_post_id": "...", "author_handle": "...",
                "author_name": "...", "completeness": "complete" },
    "posts": [
      { "id": "...", "ordinal": 0, "permalink": "https://x.com/.../status/...",
        "posted_at": <unix-seconds>, "body": "...", "raw_json": "...",
        "media": [{ "kind": "photo", "url": "...", "alt_text": "..." }, ...] },
      ...
    ]
  }
}
```

`posts` are in ordinal order. `media` is omitted when a Post has none. `raw_json` is the original X API tweet object — useful when the user asks about a field the Capture's structured columns don't surface (entities, edits, view counts).

**When to use:** after `knowledge_search` returns a hit you want to read in full, or when the user already knows the record id (rare — they almost never do; search first).

## `mcp__orchestrator__knowledge_list`

**Purpose:** paged browse of all Captures, ordered by `captured_at DESC` (most recent first).

**Arguments:**
- `limit` (optional, int, default 50, capped at 500)
- `offset` (optional, int, default 0)
- `status` (optional, string) — one of `fetching`, `ready`, `failed`. Omitted = all.

**Response shape:**
```
{
  "records": [
    { "id": "xt:...", "kind": "x_thread", "title": "...",
      "source_url": "...", "captured_at": <unix-seconds>,
      "status": "ready", "completeness": "complete" },
    ...
  ]
}
```

Summary rows only — no Post bodies. Call `knowledge_get` to read a specific Capture in full.

**When to use:** the user asks "what have I saved recently?" or "show me everything that's still fetching." Not for topical retrieval — use `knowledge_search` for that.

# The canonical retrieval loop

1. **Search.** `knowledge_search(query: <user's topic>, limit: 10)`.
2. **Filter.** Drop any hit whose `summary.status` isn't `ready` — `fetching` stubs have no Posts yet; `failed` ones have a `failure_reason` worth mentioning to the user but no body to cite. Read the remaining hits' `post_snippet` (if any) and `summary.title` to decide which Captures are actually on-topic.
3. **Pick.** Take the top relevant hit (or top few if the question warrants comparing sources).
4. **Get.** `knowledge_get(record_id: <hit.summary.id>)` to read the full Thread.
5. **Cite.** Ground your answer in the Thread's Posts. Quote sparingly; always cite back to the Post's `permalink` (or the Head's `source_url` when answering at the Thread level) so the user can verify.

If `knowledge_search` returns no hits, say so. Do not pivot to general training-data knowledge silently — the user invoked `/orc-recall` because they want the answer grounded in *their* saved material.

## Worked example: "find what the user has saved about prompt caching"

```
1. mcp__orchestrator__knowledge_search { query: "prompt caching" }
   → { hits: [
       { summary: { id: "xt:1804567890123456", title: "How I stopped wasting tokens",
                    status: "ready", completeness: "complete", ... },
         post_id: "1804567890123456",
         post_permalink: "https://x.com/anthropicai/status/1804567890123456",
         post_snippet: "...[prompt caching] cut our test-suite cost by 70%..." },
       { summary: { id: "xt:1799000111222333", ... }, ... },
       ...
     ] }

2. Pick the top hit (xt:1804567890123456).

3. mcp__orchestrator__knowledge_get { record_id: "xt:1804567890123456" }
   → { record: { thread: { author_handle: "anthropicai",
                            completeness: "complete" },
                 posts: [
                   { ordinal: 0, body: "How I stopped wasting...", permalink: "..." },
                   { ordinal: 1, body: "The key trick is...", permalink: "..." },
                   ...
                 ] } }

4. Answer the user grounded in those Posts, with the permalink(s) inline:

   "@anthropicai's saved thread on prompt caching
   (https://x.com/anthropicai/status/1804567890123456) walks through
   their three-step recipe — first they …, then …, finally … The
   bottom-line number they quote is a 70% cut on test-suite cost."
```

# Caveat policy — `truncated-tail` answers

Any answer derived from a Thread whose `thread.completeness == "truncated-tail"` MUST carry an explicit caveat in your response to the user. Use this wording (or close to it):

> (note: this thread was captured > 7 days after posting, so any later replies by the author are not in the Knowledge base.)

The reason: a `truncated-tail` Thread's tail-replies after the captured post may exist on x.com but are unknown to us. The user needs to know the ground-truth is partial so they can verify on x.com themselves before acting on a claim.

If you cite multiple Threads and only some are `truncated-tail`, scope the caveat to those — don't blanket-caveat a fully-complete citation.

# What `/orc-recall` is NOT

- **Not a capture trigger.** This skill is for *retrieval*. The user captures Threads from x.com directly via the browser extension; you do not get a tool that ingests new URLs from inside the chat.
- **Not a bookmarks importer.** The bookmarks-import path runs from Settings → X integration; agents do not invoke it.
- **Not an embedding search.** v1 is FTS5 lexical only. If the user's mental model is "find me posts about a *concept* I can't name," lexical retrieval will miss — say so honestly rather than fabricate matches.

# Composition with other skills

Other skills can mention `/orc-recall` to opt their flow into Knowledge base retrieval. The convention is to call it out in their body: "If the user references saved material, invoke `/orc-recall` first to ground the answer."

`/orc-grill` deliberately does NOT auto-pull from the Knowledge base — grilling is supposed to surface *what the user thinks*, not preempt it with citations. The user can always invoke `/orc-recall` themselves mid-grill if they want a citation injected.
