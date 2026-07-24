# Per-agent chat-agent export/import

Status: delivered

## Brief

User request (2026-07-24): standalone per-agent export/import (like components/collections have), to move agents between sites. Site export already includes agents wholesale; this is the selective, portable variant. User decisions (AskUserQuestion): name clash on import → **import as copy** (suffix, never touch the existing agent); missing referenced collections/data-source requests on target → **drop from allowlists + warn** in the summary.

### Acceptance criteria

1. **Export**: from the Chat agents admin screen, export one agent or a selection to a single JSON download — `bizbeecms.agents` v1 envelope carrying, per agent: name, systemPrompt, model, enabled, welcomeMessage, limits, dataSources, collections. NO ids, timestamps, conversations, or usage. Any requested agent missing → 404, never a silently partial export (matches components-export doctrine).
2. **Import**: upload the file on the same screen. Every agent is created as NEW; a name clash yields a suffixed copy (`name-2`, `name-3`, …) honoring the `chat_agent_name_unique` index — existing agents are never modified.
3. **Missing deps**: referenced collections / data-source requests not present on the target are DROPPED from the imported agent's allowlists; the import summary names, per agent, exactly what was dropped. Vetting uses the same predicates/config parsing the agent create/update routes use (`parseAgentConfig` path) — no parallel validation logic.
4. **Validation**: the file is a trust boundary. Malformed envelope / agent entries are rejected with meaningful, token-naming errors (AI-error-philosophy: name the exact bad field and the fix); valid agents in the same file still import (per-agent tolerance, summary reports failures). `limits` goes through the existing config validation; `model` is kept as-is (resolves against the catalog at runtime like today).
5. **Routes**: REST only, admin-gated — export GET (ids/names param), import POST. No server actions.
6. **Round-trip**: export → import on the same site yields a `name-2` copy identical except name/id/timestamps.
7. UI strings in en/fi/et.

### Non-goals
- Conversations/usage/analytics export (chat/export covers debugging; site-export covers wholesale).
- Cross-site dependency remapping UI beyond drop+warn.
- Changing the site-export format.

## Plan

Workspace: main working tree. Gauntlet: standard-plus (implement → fresh-terminal code review — the import route parses an operator-supplied file = trust boundary; review focuses there). Pure envelope/serialize/vet logic in a dep-free lib under `src/lib/chat-agents/` (or existing home), `node --test` tests. UI on chat-agents-manager.tsx (231 LOC; chat-agents-shared.tsx at 748 — refactor rule fires only if touched files reach ~1000).

Tasks:
- T1 (orc-frontend): routes + pure portable lib + manager UI (export selected / import file with summary) + tests.
- CR (orc-review, fresh): adversarial pass on the import trust boundary + copy-suffix uniqueness race + drop-vetting parity.

## Log
- 2026-07-24 19:3x brief locked from user request + 2 AskUserQuestion answers (copy-on-clash, drop+warn). T1 dispatched.

- 2026-07-24 20:0x T1 result (9e1bb70) REJECTED on verify: portable.ts committed as BINARY — raw NUL byte in `dataSourceRequestKey` separator. SECOND occurrence of the class (bt-planner was first) → codified as .orchestrator/instructions/no-raw-control-chars.md, INDEX updated (attach to every implementation brief). Sent back with exact byte offset + fix ("|" separator).

- 2026-07-24 20:03 T1 ACCEPTED (amended 1c9fc11): portable.ts now text (+249, zero control bytes), "|" separator with collision rationale. PM re-ran tsc + 2318/2318, read the full lib. CR dispatched to cr-agent-io (10EF87E1) — trust-boundary focus.
- 2026-07-24 20:05 PM browser/API QA (local dev): export → 8 portable keys only, no ids/timestamps; import → "Booking Assistant-2" created, existing untouched; ?names=nope → 404; wrong envelope → 400 with 3 token-naming errors; mixed file → bad entries failed with named fields ("collections[0].description is required", "name is required") while sibling imported. Unknown limits keys silently ignored — verified PARITY with CRUD (LIMIT_KEYS loop in core.ts), pre-existing leniency, not a defect. QA copies deleted.

- 2026-07-24 20:06 CR verdict: SHIP — injection-safe (explicit key rebuild, strict core validators, __proto__ dead), CRUD refactor semantically identical, vetting parity vs editor + runtime dispatch, copy loop sound, no leakage, honest UI summary, 0 control bytes. Both terminals closed.

## Retro

**Q1 — worker corrections?** One: ft-agent-io committed portable.ts with a raw NUL separator (file went binary in git) — the SECOND occurrence of the class (bt-planner, bulk-translate). Escalated from "watch for recurrence" to a standing instruction: `.orchestrator/instructions/no-raw-control-chars.md`, INDEX says attach to every implementation brief. Correction landed in one round (exact byte offset given).

**Q2 — user/scope corrections after approval?** None. The two AskUserQuestion decisions (copy-on-clash, drop+warn) held through delivery unchanged.

**Q3 — process creaks?** None. Standard-plus gauntlet fit; the trust-boundary-focused review brief gave the reviewer a concrete attack list and every item came back with file:line evidence. PM API-level QA (fetch round-trip from the admin session) proved faster and more precise than file-download UI driving — reusable pattern for import/export features.

**PM QA evidence:** round-trip → name-2 copy, existing untouched; 404-on-missing; 400 envelope with token-naming errors; per-entry tolerance with named fields; limits leniency verified as CRUD parity (LIMIT_KEYS). QA artifacts deleted.
