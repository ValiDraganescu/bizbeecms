# Caveats — ai-openrouter
Read every line before working. Each entry was learned the hard way by a previous Meeseeks.

- The `Ai` port (`CMS/src/lib/ports/ai.ts`) is the ONLY place that reads `env.AI`. Keep that property:
  the OpenRouter adapter reads `OPENROUTER_API_KEY` via the same boundary, not from scattered code.
- `CfAi` is the existing Cloudflare adapter — KEEP it as a fallback. The port exists to make providers
  swappable; deleting the first plug defeats the point.
- The chat route's `model` field is UNTRUSTED and must NEVER 400 — validate against the cached catalog
  ids (or static fallback), fall back to `DEFAULT_MODEL`. Don't forward arbitrary strings upstream.
- `npx opennextjs-cloudflare build` is the deploy gate. NEVER run it while `npm run dev` (3601/3602) is
  running — it corrupts `.next`. Stop dev first.
- OpenRouter is OpenAI-compatible but expects a real key; unit-test the adapter against a FAKE `fetch`
  (see archived binding-adapters' `scripts/ai-port.test.mjs`) — no live calls in tests.
- Prior context lives in `goals/archive/ai-assistant/` and `goals/archive/binding-adapters/` — read
  their JOURNAL/CAVEATS; this goal continues that work, doesn't restart it.
