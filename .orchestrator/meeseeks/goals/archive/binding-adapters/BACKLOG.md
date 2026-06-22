# Backlog — binding-adapters
Task states: TODO | DOING | DONE | BLOCKED.

## Bugs
(human-reported bugs land here, newest at top; they outrank everything)

## Tasks
- TODO: **AI assistant via the Cloudflare AI REST API + AI Gateway (second `Ai` adapter behind the port).**
  USER DECISION 2026-06-19: the assistant must call AI models over the Cloudflare AI REST API, NOT the
  `env.AI` Workers AI binding. This intentionally REVERSES the port's "no second adapter" note in
  `lib/ports/ai.ts` (lines ~6–9) — update that doc comment. Reference call (user-provided):
  `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run` with headers
  `Authorization: Bearer $CF_API_TOKEN`, `cf-aig-gateway-id: <gateway>`, `Content-Type: application/json`
  and body `{ model, input: { messages, max_tokens } }` (e.g. model `openai/gpt-4.1`).
  - Add a `RestAi implements Ai` adapter that hits that endpoint with `stream:true` (REST supports SSE),
    preserving the existing `Ai.chat(messages, options) → ReadableStream` contract so `lib/chat/reframe.ts`
    and the route are UNCHANGED. Tools: pass through the same OpenAI tool array.
  - Config from env (NOT bindings): `CF_ACCOUNT_ID`, `CF_API_TOKEN` (secret), gateway id (reuse
    `getGatewayId()` / `AI_GATEWAY`), model (existing model var/default). `getAi()` selects RestAi when the
    REST creds are present; keep `CfAi` as a fallback OR drop it per the binding-decision — note which in
    JOURNAL. Wire the gateway slug correctly (the live 2001 bug is a slug mismatch: code uses `bizbeecms-cms`,
    the working curl uses `bizbeecms-ai-gateway` — pick ONE and make code + wrangler.jsonc + the gateway agree).
  - The CMS deploy must inject `CF_ACCOUNT_ID`/`CF_API_TOKEN`/gateway into the per-Site CMS Worker
    (deployer path) — thread them like other deploy-time secrets; document in CMS README + wrangler vars.
  - This FIXES main's P1 `2001 AI Gateway` bug — cross-reference it; close that bug when this lands.
  Mock the REST adapter in a node test (request shape + SSE reframe still works); do NOT call the live API in
  tests. Gate: CMS tsc + opennext build green; regen PM cms-bundle. EN/FI/ET if any new user-facing string.
