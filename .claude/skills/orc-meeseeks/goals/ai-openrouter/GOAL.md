# Goal: ai-openrouter
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Migrate the CMS AI assistant **off Cloudflare Workers AI onto [OpenRouter](https://openrouter.ai)**,
implemented behind the **existing `Ai` port** (`CMS/src/lib/ports/ai.ts`) as a swappable adapter so a
third provider later is a weekend, not a rewrite. This **builds on** the archived `ai-assistant` and
`binding-adapters` tracks (`goals/archive/ai-assistant/`, `goals/archive/binding-adapters/`) — read
their JOURNAL/CAVEATS before starting.

## Why this is clean (de-risks the work)
The `Ai` port already exposes exactly ONE thing: an **OpenAI-compatible streaming chat completion**
(`messages` in, an SSE `ReadableStream` out, optional tool array). **OpenRouter is OpenAI-compatible**
(`POST https://openrouter.ai/api/v1/chat/completions`, `Authorization: Bearer <key>`), so the new
adapter is mostly a base-URL + auth-header + model-id swap that preserves streaming and tool-calls.
The port's doc comment (lines ~6–9) currently says "no second adapter — CF-native"; this goal
**intentionally reverses** that — update the comment to reflect the OpenRouter decision.

## What "good" looks like
- An **`OpenRouterAi` adapter** implementing the same `Ai` interface as `CfAi`, streaming from
  OpenRouter, tool-calls still round-trip. Unit-tested against a fake `fetch` like the existing
  `CMS/scripts/ai-port.test.mjs` — no live key, no Workers runtime needed.
- **`getAi()` selects the provider** by config (OpenRouter default, `CfAi` kept as fallback) — the
  swap is one switch, not scattered `env.AI` edits. `OPENROUTER_API_KEY` is a wrangler secret, wired
  into `CMS/wrangler.jsonc` + the deployer's per-CMS secret injection (`deployer/src/index.ts`).
- The **model catalog points at OpenRouter** — `GET /api/chat/models` lists OpenRouter models (its
  `/api/v1/models` endpoint) instead of the CF list-models API, keeping the existing D1 cache + static
  fallback + `DEFAULT_MODEL` pattern (`CMS/src/lib/chat/models.ts`). `DEFAULT_MODEL` becomes an
  OpenRouter id. The chat route's UNTRUSTED-`model` validation still holds against the new catalog.
- **Zero functional regression** to the assistant: `npx opennextjs-cloudflare build` green, chat
  streams, the model picker shows the OpenRouter catalog, both adapter unit tests + the CMS suite green.

## Out of scope
- Re-architecting the assistant UI / tools / page-awareness — those shipped in `ai-assistant`; this is
  a provider swap behind the port, nothing more.
- A third concrete adapter (Anthropic-direct, etc.) — the port makes it cheap later; don't build it now.
- Removing `CfAi` — keep it as the fallback adapter (the port's whole point is optionality).
