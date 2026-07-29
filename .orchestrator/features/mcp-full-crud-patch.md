# Full AI CRUD + patch semantics for collections, data sources, chat agents

Status: delivered

## Brief

Origin: a real session (2026-07-29) updating the Booking Assistant against new TableOnline
v4 docs hit every gap at once — no way to edit a data source's saved requests (forced a
duplicate source with a PLACEHOLDER secret), `update_chat_agent` silently re-defaulted
model + limits despite its description, and a 9k-char systemPrompt rewrite where a few
string patches would have done.

### The one contract (applies to every mutating tool in scope)

- **omitted = keep stored value** — including top-level fields on "full" update tools
- **null = clear / reset to default**
- **supplied scalar = replace; supplied array = replaced wholesale**, and every array
  has granular `set_*`/`remove_*` companions so resending is never required
- Delete tools are **blocked while referenced**: the error names every referencing
  entity (bindings, forms, lists, agent allowlist entries) — no force/cascade flag.
- Errors stay self-correcting (name the exact bad token + the fix), per the site's
  AI-error philosophy.

### Acceptance criteria

**A. String-patch engine (edit_text)**
1. `edit_text` gains a `replaceBetween` mode: `start` + `end` + `newString`, optional
   `inclusive` (default false — markers kept), optional `occurrence` (n-th `start`
   match, default: error when ambiguous). Replaces the text between the first
   qualifying `start` and the next `end` after it. Marker-not-found / ambiguous errors
   quote the nearest near-miss.
2. Existing `oldString`/`newString` mode unchanged; both modes re-enter the same
   validation gate as a full update of the target field (e.g. a patched bodyTemplate
   must still be valid JSON-with-placeholders; agent prompt length cap enforced).
3. New `edit_text` targets: `chat_agent.systemPrompt` (selector: agent id/name),
   `chat_agent.welcomeMessage.<locale>`, `data_request.bodyTemplate` (selector:
   source + request), `collection_item.<field>` (selector: collection + item id +
   field; long/richtext fields). Existing `component.*` / `prompt.prompt` untouched.

**B. Data sources**
4. `update_data_source` — partial patch of name / baseUrl / authType / authParam /
   secret. Secret remains WRITE-ONLY: omitted keeps the stored secret (rotating a
   path no longer costs the credential); no tool ever returns one. authType→'none'
   clears the secret; →non-none requires one stored or supplied.
5. `set_data_source_request` — upsert ONE saved request by name/id with partial
   patch of method / path / query / bodyTemplate / cacheEnabled / cacheTtlSec /
   retryable. `query` merges per-key; `null` value deletes the key.
6. `delete_data_source_request` and `delete_data_source` — guarded per the contract.
7. Existing bindings/agent allowlists referencing an updated request keep working
   (ids stable across updates).

**C. Chat agents**
8. Bug fix: `update_chat_agent` honors the contract — `name` no longer required;
   omitted model / limits / enabled / welcomeMessage keep stored values (regression
   test reproducing the observed model+limits reset).
9. `set_chat_agent_data_source` / `set_chat_agent_collection` become merge patches
   on the matched entry: only supplied fields change; `null` clears an optional
   field (maxCallsPerConversation, requiredParams, lookupFields).
10. `welcomeMessage` locale objects merge per-locale; `null` removes a locale.

**D. Collections**
11. `update_collection` — description, label, and the `publicSubmissions` toggle
    (user-approved: AI may toggle it; tool description notes submissions land as
    drafts regardless).
12. `update_collection_field` — description, type change (result names the exact
    coercion applied to existing rows), required/default.
13. `delete_collection` — guarded per the contract.
14. `restore_collection_item` (un-archive) and `delete_collection_item` (hard
    delete; description states it is permanent and distinct from archive).

**E. Docs & surface**
15. Both guides updated: `data-sources-guide.ts` drops "there is NO update tool /
    operator edits in Admin"; `chat-agents-guide.ts` documents the contract and the
    merge-patch behavior. MCP catalog + `tool-scopes.ts` expose every new tool to
    the admin/MCP scope (NOT to guest chat agents).
16. Every new/changed pure validator + formatter has dep-free `node --test`
    coverage (repo convention); business logic only, no store/ORM tests.

### Non-goals
- Reading secrets back (explicitly rejected).
- Force/cascade deletes.
- Pages/blocks editing changes (structured JSON stays read→replace via page tools).
- Admin UI changes — this is tool-layer only; Admin REST/UI already covers these ops.
- Guest-agent-facing tools: everything here is admin/MCP-scope only.

## Plan

**Workspace:** main working tree (CMS/). Sequential workers only — every task touches the
tool registry surface; no parallel dispatch.

**Gauntlet:** risky/core (whole MCP tool layer, delete guards, secret handling) →
implement (T1–T7) → refactor pass → code review → test review → QA.

**Key code facts (from scout):**
- Registry + all handlers: `CMS/src/lib/chat/tool-dispatch.ts` (2353 LOC — decompose FIRST, T1).
- Per-tool schema+validator files colocated in `CMS/src/lib/chat/*-tools.ts`; pure validators,
  tests in `CMS/scripts/*.test.mjs` (`node --test`, dep-free).
- Scopes: `CMS/src/lib/chat/tool-scopes.ts` (KNOWN_TOOL_NAMES, TOOLS_BY_CONTEXT, CONTEXT_PROMPTS).
  MCP route exposes `allToolSchemas()`; guest tools are a separate registry (`public-chat/guest-tools.ts`) — untouched.
- Stores: `CMS/src/db/data-source-store.ts` (update/delete already exist store-side),
  `chat-agent-store.ts`, `collection-store.ts`, `item-store.ts` (restore=unarchiveItem, deleteItem exist).
- NO reference-guard exists today; reference shapes: block `bindings` (sourceId/requestId or
  collection), `listSource`, `formTarget`, GuestChat block agent-by-name, agent allowlists
  (`chatAgent.dataSources`/`collections` JSON). Model for a full walk: `site-export.ts`.
- Agent config semantics: `public-chat/core.ts` (882 LOC — watch the 1000 line ceiling;
  `parseAgentConfig`, `validateWelcomeMessage`, DEFAULT_LIMITS).
- Secrets: `dataSource.secretEnc`, `SafeDataSource` strips it; `decryptSourceSecret` internal only.

**Tasks (each = one fresh orc-backend worker, commit when green):**
1. **T1 dispatch-decompose** — behavior-preserving split of tool-dispatch.ts into per-domain
   handler modules (collections / data-sources / chat-agents / content-write / bindings-forms /
   text-edit …), registry stays single source of truth; all tests green, no schema changes.
2. **T2 reference-scan** — pure reference walker (given site pages+components+agents JSON,
   return references to a sourceId / requestId / collection tableName / field) + `node --test`
   coverage; store-agnostic core, thin CF loader. Delivers `describeReferences` used by all
   delete guards.
3. **T3 data-sources (Brief B)** — update_data_source (partial patch, secret write-only,
   authType transitions), set_data_source_request (upsert, per-key query merge, null deletes
   key), delete_data_source_request + delete_data_source guarded via T2; ids stable; cache
   version cleanup on delete (purge.ts).
4. **T4 chat-agents (Brief C)** — update_chat_agent contract fix (omitted=keep, null=clear;
   regression test for model+limits reset), set_chat_agent_data_source/_collection become
   merge patches (null clears optional fields), welcomeMessage per-locale merge.
5. **T5 collections (Brief D)** — update_collection (description/label/publicSubmissions),
   update_collection_field (description/required/default/type change naming exact coercion),
   delete_collection guarded via T2, restore_collection_item, delete_collection_item (permanent,
   description says so).
6. **T6 edit_text (Brief A)** — replaceBetween mode (start/end/inclusive/occurrence, near-miss
   errors) + new targets chat_agent.systemPrompt, chat_agent.welcomeMessage.<locale>,
   data_request.bodyTemplate, collection_item.<field>; every patched value re-enters the same
   validation gate as a full update of that field (reuse T3–T5 validators).
7. **T7 docs & surface (Brief E)** — both guides rewritten for the contract, tool-scopes
   KNOWN_TOOL_NAMES + TOOLS_BY_CONTEXT + CONTEXT_PROMPTS updated for every new tool,
   guide lock-tests updated; confirm MCP catalog exposes all new tools, guest registry unchanged.

**Agents:** orc-backend (T1–T7), orc-review (code review), orc-test-review, orc-qa (QA =
tests + live /mcp exercise against dev server). Attach `no-raw-control-chars.md` to every
implementation brief.

## Log

- 2026-07-29 feature file created from session plan; scope questions answered by user
  (block+list deletes; publicSubmissions AI-togglable; restore + hard delete for
  items; secrets stay write-only).
- 2026-07-29 19:43 PM boot; `implement` = brief approval; Plan written (7 tasks, risky/core gauntlet); Status → building.
- 2026-07-29 19:43 T1 dispatched → t1-dispatch-decompose (3E7FCE7F, orc-backend): split tool-dispatch.ts (2353 LOC) into per-domain handler modules.
- 2026-07-29 19:55 T1 VERIFIED (commit 5d53909): tool-dispatch.ts 2353→320, 10 new modules all <600 LOC; tsc clean, 2332 tests green (PM re-ran both). Worker closed.
- 2026-07-29 19:55 T2 dispatched → t2-reference-scan (9D4C171F, orc-backend): pure reference walker + tests.
- 2026-07-29 20:03 T2 VERIFIED (commit dcda474): reference-scan.ts (304) + loader (119) + 19 tests; PM read the core — matching/formatter sound; tsc clean, 2351 green. Worker closed.
- 2026-07-29 20:04 T3 dispatched → t3-data-sources (D6030759, orc-backend): update_data_source, set_data_source_request, guarded deletes.
- 2026-07-29 20:12 T3 VERIFIED (commit 93c7490): 4 tools; PM read handlers + merge validators — contract, write-only secret, auth↔secret invariants, per-key query merge, stable ids, guards + purge prune all correct; tsc clean, 2372 green. Worker closed.
- 2026-07-29 20:13 T4 dispatched → t4-chat-agents (792E0B1B, orc-backend): update_chat_agent contract bug fix + regression test, merge-patch set_* entries, per-locale welcome merge.
- 2026-07-29 20:27 T4 VERIFIED (commit 6203688): new pure chat-agent-patch.ts (318); PM read merge core — omitted=keep/null=reset correct, entry patches re-validate via strict core, regression test proven failing pre-fix; tsc clean, 2386 green. Worker closed.
- 2026-07-29 20:28 T5 dispatched → t5-collections (E0ABAE78, orc-backend): update_collection, update_collection_field (type-change coercion naming), guarded delete_collection, restore/hard-delete item.
- 2026-07-29 20:30 T5 blocker answered: collection.description = new nullable column via Drizzle flow (PM's "no migrations needed" was wrong); field description additive in schema JSON; label = registry name rename, tableName immutable.
- 2026-07-29 20:40 T5 VERIFIED (commit bde6f6e): 5 tools + migration 0035 (drizzle-generated, local-applied); PM read schema-rebuild diff — "update" op rides existing rebuild, affinity-based coercion naming, description-only = zero DDL; tsc clean, 2418 green. Worker closed.
- 2026-07-29 20:41 T6 dispatched → t6-edit-text (B1662B0E, orc-backend): replaceBetween mode + 4 new targets re-entering full-field validation gates.
- 2026-07-29 20:48 T6 VERIFIED (commit 38f6a2c): applyBetween semantics match AC1 exactly (occurrence-required ambiguity, near-miss quoting, inclusive default false); per-target gate re-entry read; tsc clean, 2435 green. Worker closed.
- 2026-07-29 20:49 T7 dispatched → t7-docs-surface (32B86E4F, orc-backend): guides rewrite, tool-scopes audit, lock-tests, catalog + guest-registry confirmation.
- 2026-07-29 20:57 T7 VERIFIED (commit 2c534c1): stale claims removed + lock-tested absent; edit_text scope gap fixed; guest registry confirmed unchanged; T5 leftover (site-settings roster description, 4 lines) swept in; tsc clean, 2436 green. Worker closed. All implementation tasks done.
- 2026-07-29 20:58 G1 refactor pass dispatched → g1-refactor-pass (35DE1929, orc-backend): reuse/dead-weight sweep + 1000-LOC rule over 5d53909..HEAD.
- 2026-07-29 21:02 G1 VERIFIED (commit 70397f5): chat-agent-tools 911→477 (schemas split out verbatim), canonical ArgResult/asRecord in tool-args.ts; 4 extractions rejected in writing (sound reasons); no file near 1k; tests unmodified, 2436 green. Worker closed.
- 2026-07-29 21:03 G2 code review dispatched → g2-code-review (854BD969, orc-review): full-diff review, 8 focus areas (contract null-vs-omitted, secrets, guard bypass, regression wiring, coercion truthfulness, replaceBetween edges, scopes, migration).
- 2026-07-29 21:07 G2 verdict: SHIP + 3 minors (guard fail-open on unparseable blocks; raw NOT NULL error on required:true with NULL rows; handler duplication/TOCTOU). All 8 areas otherwise clean.
- 2026-07-29 21:08 G2-FIX dispatched → g2fix-review-findings (8C91C512, orc-backend): fail-closed guard, NULL-rows pre-check, handler dedup. Reviewer kept open for re-check.
- 2026-07-29 21:15 G2-FIX landed (commit 39ff2df, +8 tests, 2444 green, PM re-ran gates); re-review requested from g2-code-review.
- 2026-07-29 21:17 G2 re-review: SHIP, all 3 resolved (COALESCE backfill rides atomic contentDdlBatch); 1 accepted nit (allowlist JSON parses open — store-written, low risk). Both workers closed.
- 2026-07-29 21:18 G3 test review dispatched → g3-test-review (74B6AAA7, orc-test-review).
- 2026-07-29 21:19 G3 verdict: PASS — no banned patterns, C8 regression + all contract branches pinned; advisories: secret-value-absence assertion weak, edit_text gate re-entry only live-testable (→ QA scenario d). Worker closed.
- 2026-07-29 21:20 G4 QA dispatched → g4-qa (F6944FF2, orc-qa): full suite + live scratch-entity scenario incl. origin-bug repro, C8 live check, gate re-entry, guard block/unblock cycle.
- 2026-07-29 21:24 G4 QA: scenarios a/b/c/e/f PASS live (origin bug + C8 confirmed fixed live; guards + coercion + backfill work); DEFECT: AC2 bodyTemplate JSON-with-placeholders gate missing entirely (both write paths accept unbalanced JSON); MINOR: all-unknown-keys limits patch silently resets to defaults. DB left clean.
- 2026-07-29 21:25 G4-FIX dispatched → g4fix-qa-defects (606CC4DC, orc-backend): shared bodyTemplate gate mirroring fetch.ts placeholder rules; unknown limit keys named. QA terminal kept open for re-test.
- 2026-07-29 21:28 G4-FIX landed (commit 63f9ba2): bodyTemplateJsonError in shared validate.ts gates ALL write paths incl. Admin REST; unknown limit keys rejected; +4 tests, 2448 green (PM re-ran). Re-test sent to g4-qa.

- 2026-07-29 21:30 G4 re-test PASS (brace-removal rejected + D1 unchanged; valid template accepted; unknown limit key named, stored limits intact). Gauntlet complete.
- 2026-07-29 21:32 PM final AC walk 1–16: every criterion implemented + independently verified (diff reads, G2 review, G3 test review, G4 live QA). Status → delivered.

## Retro

**1. Worker corrections?** Two, both actually PM-brief defects, same class: the Brief/briefs
asserted codebase facts that weren't true — T5 was told "no migrations needed" (collection
description column didn't exist) and T6/AC2 named a "JSON-with-placeholders gate" in
validateRequestInput that never validated JSON (QA caught the unbalanced-template write).
Workers were right to push back / QA to catch it. Lesson: extended the existing
"verify named implementation paths" entry in pm-process.md to cover ALL asserted codebase
facts (columns, gates, validators), with the scout explicitly tasked to confirm each Brief
assumption. No worker-skill gap → no new worker instruction file.

**2. User scope corrections after approval?** None. The pre-approved Brief (scope questions
answered in the originating session) held for the entire build unchanged.

**3. Process creak?** None worth changing. The risky/core gauntlet earned its cost: G2 caught
the fail-open guard, G3's "only live-testable" advisory pointed QA straight at the missing
gate, and G4's live D1 verification caught what three review stages couldn't. Decompose-first
(T1) kept every later diff small. Sequential single-worker dispatch on the shared registry
surface produced zero conflicts.

**Delivered:** commits 5d53909..63f9ba2 (10), 2332→2448 tests. Not pushed — release belongs
to the release manager.
