/**
 * external-data-sources — on-demand data-sources guide for the CMS AI.
 *
 * Mirrors the `get_authoring_guide` pattern (read-tools.ts): the assistant reads
 * this guide ON DEMAND via a tool instead of the base system prompt carrying it
 * (context prompts stay short; the full playbook costs tokens only when the
 * task is actually about data sources / bindings / forms).
 *
 * Unlike get_authoring_guide the content is STATIC — it documents the SHIPPED
 * tool surface (list/create/test_data_source, bind_component, create_list,
 * bind_list, create_form, bind_form), not live site data (list_data_sources
 * covers that). PURE module (no `@/`/React/CF imports) so it runs under the
 * dep-free `node --test` convention; the CF wiring is one trivial handler in
 * tool-dispatch.ts.
 *
 * Every tool name/arg below was verified against the shipped schemas — if you
 * rename a tool or change an arg, update this guide in the same commit
 * (scripts/data-sources-guide.test.mjs locks the names).
 */

export const GET_DATA_SOURCES_GUIDE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_data_sources_guide",
    description:
      "Fetch the complete external-data-sources playbook: how to create, test " +
      "and use API data sources (auth modes, saved requests, {placeholder} " +
      "params, caching/retries), how to bind components and Lists to them or to " +
      "collections, and how to build visitor forms (create_form/bind_form — API " +
      "targets AND collection targets incl. the publicSubmissions opt-in). Call " +
      "this BEFORE working with data sources, bindings, or forms so you follow " +
      "the exact shipped workflow instead of guessing.",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const DATA_SOURCES_GUIDE = `# External data sources, bindings, and visitor forms — the playbook

## Concepts
- A DATA SOURCE is an external API: base URL + auth method + an optional WRITE-ONLY
  secret (stored encrypted; no tool ever returns it — only \`hasSecret\`).
- Each source has SAVED REQUESTS: name, method (GET/POST/PUT/DELETE), path, query,
  optional JSON \`bodyTemplate\`, per-request cache config (\`cacheEnabled\` default
  true, \`cacheTtlSec\` default 60), and \`retryable\` (marks a non-GET as
  idempotent-safe, enabling retries + caching for it).
- Path, query values and body template may contain \`{placeholder}\` tokens filled
  at bind/test/submit time. Values are safely URL-encoded / JSON-escaped.
- Auth types: \`header\` (secret in the header named \`authParam\`, e.g.
  Authorization or X-API-Key — include any "Bearer " prefix IN the secret),
  \`query\` (secret as the query param named \`authParam\`, e.g. appid), \`basic\`
  (secret is "user:password"), \`oauth2\` (client credentials: \`authParam\` is the
  token URL, secret is "client_id:client_secret"), \`none\` (public API).

## Workflow: create → test → bind
1. \`list_data_sources\` — the configured sources + saved requests (ids, names,
   methods, paths, placeholders, cache config). Prefer reusing an existing one.
2. \`create_data_source\` — define a source AND its saved requests in one call
   (\`name\`, \`baseUrl\`, \`authType\`, \`authParam\`, \`secret\`, \`requests\`). There is
   NO update tool — changing an existing source/request is done by the operator
   in Admin → Data Sources.
3. \`test_data_source\` — run a saved request LIVE (cache bypassed): pass
   \`source\` and \`request\` (id OR name) + \`params\` for every placeholder. The
   result's \`paths\` array lists every leaf dot-path in the response (e.g.
   "main.temp", "list.0.name") — these are exactly what \`map\` values must be
   when binding. ALWAYS test before proposing a map.
4. Bind (see below). Bindings persist resolved IDs, so renames won't break them.

## Binding blocks to data
- \`bind_component\` — fill ONE block's props from a single item. Collection kind:
  \`collection\` (content_<slug> table) + optional \`filter\`/\`sort\` (first match
  wins) + \`map\` of { propName: fieldName }. API kind: \`source\` + \`request\` +
  \`map\` of { propName: "response.dot.path" } + \`params\`. Never both kinds.
  Omit both \`collection\` and \`source\` to CLEAR the binding.
- \`create_list\` — insert a built-in List into a Section: repeats a \`template\`
  component once per row. Rows from a collection (\`collection\`+\`filter\`/\`sort\`)
  or an API request (\`source\`+\`request\`+\`params\`; \`itemsPath\` digs to a nested
  rows array like OpenWeather's "list"). \`map\` = { templatePropName: fieldOrPath }.
- \`bind_list\` — PATCH an existing List: row source, template, map, limit, and
  presentation (flat list layouts or \`presentation:"combobox"\` — a select/
  combobox on a page IS a List block, not a component).
- Map only props DECLARED on the component's props schema; undeclared props are
  rejected. \`params\` values are literal strings, or { prop: "propName" } to read
  one of the block's own props at render.

## Render semantics (why binds are safe)
- The Worker fetches server-side at render; the secret NEVER reaches the browser.
- Responses are cached per request (only GET or retryable-marked requests);
  failed/oversized/cross-origin-redirect responses are never cached.
- Up to 2 retries (3 attempts) on network error / 5xx / 429 — GET or retryable
  requests only; other 4xx never retry.
- Failures degrade gracefully (block renders empty) — a broken API never 500s
  the page.
- Cache purging is operator-only (per-request and global purge buttons in
  Admin → Data Sources); there is no AI purge tool. test_data_source always
  bypasses the cache.

## Visitor forms (create_form / bind_form)
- \`create_form\` inserts a built-in Form block into a Section: pass \`page\` (id)
  and \`section\` (block id — get_page shows the tree), plus a TARGET.
- The target is source-agnostic, exactly one kind:
  - API: \`source\` + \`request\` (typically POST/PUT/DELETE). Visitor field values
    fill the request's {placeholder} tokens server-side; submissions are never
    retried and never cached.
  - Collection: \`collection\` (content_<slug> table). The collection must have
    \`publicSubmissions\` enabled — if not, the tool errors with the fix: the
    OPERATOR must PATCH /api/collections/<table> with
    {"_op":"set_public_submissions","enabled":true} (deliberately no AI tool).
    Submitted items land as DRAFT (never auto-published); unknown/system fields
    are dropped.
- Field mapping is BY NAME — there is no map argument: each \`<input name=…>\`
  inside the form must match a request {placeholder} name (API) or a declared
  collection field name. The tool result's \`fields\` array lists the expected
  names; its \`note\` restates them.
- PREFER the \`child\` arg: create_component the form's input component first
  (inputs named after \`fields\` + a type="submit" button — native form semantics,
  no JS wiring), then pass its name as create_form's \`child\` so ONE call yields
  a complete submittable form. Without \`child\` the form is empty and you must
  place the component via update_page_blocks re-passing the ENTIRE tree.
- Optional: \`successMessage\`/\`errorMessage\` (inline, fetch mode) and \`redirect\`
  (same-site path starting "/", used after a no-JS submit). Both submit modes
  (native form POST and fetch/JSON) hit the same endpoint automatically.
- \`bind_form\` PATCHes an existing Form block (\`page\` + \`block\`): switch/set the
  target, update messages/redirect (pass only what changes), or \`clear: true\`
  to remove the target.

## Errors are self-correcting — read them
Unknown source/request/collection/component errors LIST the available names;
the non-opted-in-collection error quotes the exact PATCH fix; a missing block
id error tells you to give the block a short unique id. On such an error,
correct the named argument and retry — do not repeat the same call.`;
