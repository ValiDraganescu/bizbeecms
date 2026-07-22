/**
 * public-guest-chatbots — on-demand chat-agents guide for the CMS AI.
 *
 * Mirrors `data-sources-guide.ts` / the `get_authoring_guide` pattern: the
 * assistant reads this playbook ON DEMAND via a tool instead of the base system
 * prompt carrying it (context prompts stay short; the full playbook costs tokens
 * only when the task is actually about chat agents).
 *
 * STATIC content documenting the SHIPPED tool surface (list/get/create/update/
 * delete_chat_agent + the granular update_chat_agent_settings /
 * set_chat_agent_limits / set_chat_agent_data_source / set_chat_agent_collection
 * family) + the config shape, safety model, and placement workflow —
 * NOT live site data (list_chat_agents / list_data_sources / query_collection
 * cover that). PURE module (no `@/`/React/CF imports) so it runs under the
 * dep-free `node --test` convention; the CF wiring is one trivial handler in
 * tool-dispatch.ts.
 *
 * Every tool name/arg below was verified against the shipped schemas — if you
 * rename a tool or change an arg, update this guide in the same commit
 * (scripts/chat-agents-guide.test.mjs locks the names).
 */

export const GET_CHAT_AGENTS_GUIDE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_chat_agents_guide",
    description:
      "Fetch the complete guest-chatbot (chat agents) playbook: what a chat agent " +
      "is, the config shape (usage limits with defaults + meanings, the dataSources " +
      "and collections allowlists), the safety model (guests only ever get the " +
      "allowlisted tools; queries see published items; creates/updates land as " +
      "drafts), and how to place a bot on a page (GuestChat block). Call this BEFORE " +
      "non-trivial chat-agent work so you follow the exact shipped workflow instead " +
      "of guessing.",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const CHAT_AGENTS_GUIDE = `# Guest-facing chatbots (chat agents) — the playbook

## What a chat agent is
- A CHAT AGENT is a guest-facing chatbot placed on a PUBLISHED page. A logged-out
  visitor talks to it; the model runs server-side in the Site's Worker. The visitor
  NEVER chooses the model, prompt, or tools — only what the operator configured.
- An agent has: \`name\` (unique), \`systemPrompt\` (persona/instructions), optional
  \`model\` (omit → site default) and \`welcomeMessage\`, \`enabled\` (default true), plus
  three config blocks: \`limits\`, \`dataSources\`, \`collections\`.

## Tools
- \`list_chat_agents\` — the agents (id, name, enabled, model, limit summary, tool
  counts). Discover what exists before editing.
- \`get_chat_agent\` — ONE agent's FULL config by \`agent\` (id OR name): the
  systemPrompt, welcome message, every limit, and the complete allowlists. Read
  this (or use the attached page context) before editing — never guess at what's
  stored.
- \`create_chat_agent\` — define one (\`name\` + \`systemPrompt\` required; the rest
  optional). Returns the created agent's summary.
- \`delete_chat_agent\` — remove by \`agent\` (id OR name).

### Editing an existing agent — PREFER the granular tools
Each changes ONLY what you pass and cannot clobber the rest of the config (the
failure mode of re-sending a whole config):
- \`update_chat_agent_settings\` — patch scalars: name, systemPrompt, model
  (null → site default), enabled, welcomeMessage (null → clear). Omitted = kept.
- \`set_chat_agent_limits\` — patch individual limit keys; number sets, null
  resets that key to its default, omitted keys keep their stored value.
- \`set_chat_agent_data_source\` — upsert ONE dataSources allowlist entry,
  matched by \`toolName\`; other entries untouched. The source/request refs must
  resolve to real records (id or name accepted; stored as ids).
- \`remove_chat_agent_data_source\` — drop ONE entry by \`toolName\`.
- \`set_chat_agent_collection\` — upsert ONE collections entry, matched by the
  \`content_<slug>\` table name; other entries untouched.
- \`remove_chat_agent_collection\` — drop ONE entry by table name.

\`update_chat_agent\` remains for FULL reconfigurations only: address by \`agent\`
(id OR name); FULL-REPLACE for supplied fields (pass the WHOLE config — a
supplied array REPLACES the stored one, it does not merge; omitted top-level
fields keep their stored value, but name + systemPrompt must always be passed).

## limits (abuse prevention — all optional, omit a key for its default)
Message-count based (the per-response token cap is separate). Each value is clamped
to a hard ceiling.
- \`perIpPerMinute\` (default 10) — requests one visitor IP may send per minute.
- \`perIpPerDay\` (default 100) — per IP per day.
- \`siteMessagesPerDay\` (default 500) — total across the whole site per day; the
  real cost backstop (the OpenRouter key's monthly USD cap is the ultimate one).
- \`maxMessagesPerConversation\` (default 30) — messages before a visitor must start
  a new chat.
- \`maxUserMessageLen\` (default 2000) — characters per visitor message.
- \`maxToolRounds\` (default 3) — tool-call rounds per reply.
- \`maxTokensPerResponse\` (default 1000) — output tokens per reply; whatever is
  configured is additionally capped by the selected model's own output limit at
  request time.
Tighten these for a public/high-traffic page; loosen only with a cost reason.

## dataSources allowlist (external-API tools the bot may call)
Each entry becomes ONE guest tool (\`ds_<slug>\` from \`toolName\`).
- \`sourceId\` + \`requestId\` MUST reference an EXISTING data source + saved request —
  call \`list_data_sources\` for the real ids; never invent them.
- \`toolName\` — short label (slugified into the tool name the bot sees).
- \`description\` — what the tool does; the guest bot reads THIS to decide when to
  call it, so make it clear and task-scoped.
- \`maxCallsPerConversation\` (optional) — per-conversation call cap for this tool.
The request's saved secret stays server-side; the visitor never sees it.

## collections allowlist (collection ops the bot may perform)
Each entry names a \`content_<slug>\` table (discover via \`query_collection\`) + flags:
- \`canQuery\` — read PUBLISHED items only (equality filters on declared fields).
- \`canCreate\` — create items; they land as DRAFTS for operator review.
- \`canUpdate\` — patch items; the item is forced back to DRAFT. REQUIRES a
  non-empty \`lookupFields\`.
- \`lookupFields\` — exact-match field names that scope an update to exactly ONE
  item. If zero or many match, the update is refused (never touches another item).
  update semantics are deliberately minimal — a real guest-identity story is
  deferred; only enable canUpdate when the lookup uniquely identifies an item.
- \`description\` — what the collection holds; the guest bot reads this.

## Safety model
- The guest bot ONLY ever gets the allowlisted tools — nothing else in the CMS is
  reachable from the public chat path.
- Queries return PUBLISHED items only; creates and updates land as DRAFTS the
  operator reviews. The bot can never publish.
- The visitor's transcript is sanitized server-side (system roles stripped, counts
  + lengths capped) — the operator's systemPrompt always wins.

## Conversations (visibility + export)
- EVERY guest conversation is stored with full gateway fidelity: the system
  prompt, the tool definitions, and the whole message list — including tool calls
  and their results — plus per-message timestamps. Nothing is summarized away.
- Message timestamps are in the VISITOR's LOCAL time (the widget reports the
  visitor's timezone / UTC offset), not the server's. Every agent also ALWAYS gets
  a builtin \`local_time_to_utc\` tool so it can convert a visitor-local time to UTC
  before booking or comparing against server data — you never configure it.
- Operators review and DOWNLOAD any conversation as a single JSON document from the
  per-agent Conversations page (the Conversations button next to each agent in the
  Chat agents admin); there is no assistant tool for this — point the operator at
  that page.

## Placement workflow (create agent → place block → publish)
1. \`create_chat_agent\` here (reference real sources/requests + collections).
2. Place a GuestChat block on a page — this happens in the PAGE BUILDER / PAGES
   assistant, not here. The block is:
   { component: "GuestChat", props: { agent: "<agent id or name>",
     mode: "inline" | "floating", title, placeholder, welcome } }
   placed inside a Section column (via update_page_blocks), like any component.
   \`mode\` "inline" is an embedded panel; "floating" is a launcher bubble.
3. Publish the page. The public widget then talks to POST /api/public-chat.
If you are on the Chat Agents page, point the operator to the Page Builder/Pages
assistant for the block placement.

## Errors are self-correcting — read them
Unknown agent errors LIST the existing agent names; a name clash names the taken
name; a bad config field names the exact field + the fix. On such an error, correct
the named argument and retry — do not repeat the same call.`;
