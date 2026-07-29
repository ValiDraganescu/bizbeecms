/**
 * external-data-sources — on-demand data-sources guide for the CMS AI.
 *
 * Mirrors the `get_authoring_guide` pattern (read-tools.ts): the assistant reads
 * this guide ON DEMAND via a tool instead of the base system prompt carrying it
 * (context prompts stay short; the full playbook costs tokens only when the
 * task is actually about data sources / bindings / forms).
 *
 * Unlike get_authoring_guide the content is STATIC — it documents the SHIPPED
 * tool surface (list/create/update/test/delete_data_source,
 * set/delete_data_source_request, bind_component, create_list, bind_list,
 * create_form, bind_form, edit_text on a saved request's bodyTemplate), not
 * live site data (list_data_sources covers that). PURE module (no `@/`/React/CF imports) so it runs under the
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
      "Fetch the complete external-data-sources playbook: how to create, test, " +
      "PATCH and delete API data sources and their saved requests (auth modes, " +
      "write-only secrets, {placeholder} params, caching/retries, guarded " +
      "deletes), how to bind components and Lists to them or to " +
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
   (\`name\`, \`baseUrl\`, \`authType\`, \`authParam\`, \`secret\`, \`requests\`). Any
   auth type except \`none\` REQUIRES \`secret\` at create time — but a missing
   credential must NOT stall the work: if the operator hasn't shared the real
   key (or asks for a dummy), create with the literal secret "PLACEHOLDER" and
   rotate it later — \`update_data_source\` with just \`source\` + \`secret\`, or
   the operator pastes it in Admin → Data Sources (requests simply fail auth
   until it's replaced).
3. \`test_data_source\` — run a saved request LIVE (cache bypassed): pass
   \`source\` and \`request\` (id OR name) + \`params\` for every placeholder. The
   result's \`paths\` array lists every leaf dot-path in the response (e.g.
   "main.temp", "list.0.name") — these are exactly what \`map\` values must be
   when binding. ALWAYS test before proposing a map.
4. Bind (see below). Bindings persist resolved IDs, so renames won't break them.

## Editing sources & requests (patch semantics)
The one contract on every patch tool: OMITTED = keep the stored value, null =
clear/reset to the default, a supplied value replaces.
- \`update_data_source\` — patch a source (by id or name): \`name\`, \`baseUrl\`,
  \`authType\`, \`authParam\`, \`secret\`. The secret stays WRITE-ONLY: OMIT it to
  KEEP the stored credential (rotate a baseUrl/path without re-pasting the key);
  no tool ever returns one. \`authType\` 'none' clears the stored secret;
  switching TO an auth type requires a secret already stored or supplied in the
  same call. Validated exactly like create_data_source.
- \`set_data_source_request\` — upsert ONE saved request (\`source\` + \`request\`
  by id or name): a match is PATCHED and its id stays STABLE, so existing
  bindings and chat-agent allowlists keep working; no match CREATES a request
  (then \`path\` is required). null resets a field to its default (method GET,
  cacheEnabled true, cacheTtlSec 60, retryable false, no body). \`query\` merges
  PER-KEY: pass only the keys to change; a null value DELETES that key; omitted
  keys stay.
- \`edit_text\` with target 'data_request.bodyTemplate' (\`source\` + \`request\`)
  — patch a long JSON body template by snippet instead of resending it; the
  patched result must still be a valid template (rejected otherwise, nothing
  written).

## Deleting (guarded)
\`delete_data_source_request\` removes ONE saved request; \`delete_data_source\`
removes the source AND all its requests (its encrypted secret is destroyed with
it). Both are BLOCKED while anything references the target — a block binding, a
List, a form target, or a chat agent's allowlist: the error lists EVERY
referencing place AND the tool that clears each. Remove them all, then retry.
There is no force/cascade flag.

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

## Dynamic pages & route values
- A create_page slug segment authored as ":city-slug" is a WILDCARD matching
  any value in that position. Prefer ONE wildcard page bound to a collection
  over authoring N near-identical static pages per item.
- Anywhere a binding filter value, a List \`search\`, or a set_block_props
  string prop takes a literal, you may instead pass { "param": "city-slug" }
  to read the page's wildcard match, or { "query": "q" } to read a URL query
  param (?q=...). Resolved per-request; a clause whose param/query is absent
  that request is dropped (no filter/search) — never an error.

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
    \`publicSubmissions\` enabled — if not, the tool errors with the fix: enable
    it with \`update_collection\` ({ collection, publicSubmissions: true }).
    Submitted items land as DRAFT regardless (never auto-published);
    unknown/system fields are dropped.
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
the non-opted-in-collection error names the update_collection fix; a blocked
delete lists every reference and the tool that clears each; a missing block
id error tells you to give the block a short unique id. On such an error,
correct the named argument and retry — do not repeat the same call.`;
