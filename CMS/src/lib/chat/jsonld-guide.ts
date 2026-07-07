/**
 * seo-robots — on-demand JSON-LD (structured-data) authoring guide for the CMS AI.
 *
 * Mirrors the `get_data_sources_guide` pattern (data-sources-guide.ts): the
 * assistant reads this guide ON DEMAND via a tool instead of the base system
 * prompt carrying it (context prompts stay short; the full playbook costs tokens
 * only when the task is actually about JSON-LD / rich results).
 *
 * The content is STATIC — it documents the SHIPPED jsonld surface (the `kind`
 * param on create_component/update_component, the slot-quoting rules that
 * `validateJsonLdArtifact` enforces, and the two List modes: per-row via a
 * jsonld List template child vs aggregate via `bind_list itemList:true`). PURE
 * module (no `@/`/React/CF imports) so it runs under the dep-free `node --test`
 * convention; the CF wiring is one trivial handler in tool-dispatch.ts.
 *
 * Every tool name/arg/quoting-rule below was verified against the shipped
 * schemas (component-tool.ts validateJsonLdArtifact, binding-tools.ts bind_list)
 * — if you rename a tool, change an arg, or change the quoting contract, update
 * this guide in the SAME commit (scripts/jsonld-guide.test.mjs locks them).
 */

export const GET_JSONLD_GUIDE_TOOL = {
  type: "function" as const,
  function: {
    name: "get_jsonld_guide",
    description:
      "Fetch the complete JSON-LD (schema.org structured data) authoring " +
      "playbook: how to author an INVISIBLE jsonld component (create_component " +
      "kind:'jsonld'), the exact slot-quoting rules (string slots quoted, " +
      "numeric/array slots unquoted), the schema.org patterns per page type " +
      "(Product, Article, FAQPage, Recipe, BreadcrumbList), WHEN to add a jsonld " +
      "component vs plain content, and the two List modes (per-row Product/" +
      "Article scripts vs one aggregate ItemList via bind_list itemList:true). " +
      "Call this BEFORE authoring structured data / rich-results markup so you " +
      "follow the exact shipped workflow instead of guessing.",
    parameters: { type: "object", properties: {}, required: [] },
  },
} as const;

export const JSONLD_GUIDE = `# JSON-LD structured data (schema.org rich results) — the playbook

## What a jsonld component IS
- A jsonld component is a NORMAL component authored with \`create_component\`
  (or edited with \`update_component\`) but with \`kind:"jsonld"\`. It renders NO
  visible HTML — it emits a single \`<script type="application/ld+json">\` in the
  page head/flow, which search engines read for rich results (star ratings,
  breadcrumbs, FAQ accordions, recipe cards, etc.).
- For a jsonld component the \`html\` field is NOT markup — it is a JSON-LD
  TEMPLATE: a schema.org object with \`@context\` + \`@type\` and \`{{slot}}\`
  placeholders. \`script\` and \`css\` are IGNORED (a jsonld component emits no JS/CSS).
- It is added to a page as a block via the builder or the AI EXACTLY like any
  other component, and follows the SAME draft/publish lifecycle.

## Slot quoting — the one rule that bites
The template must be valid JSON once slots are filled, so:
- STRING values → wrap the slot in quotes: \`"name": "{{title}}"\`.
- NUMBER / BOOLEAN / ARRAY / OBJECT values → leave the slot UNQUOTED:
  \`"ratingValue": {{rating}}\`, \`"reviewCount": {{count}}\`.
- The validator probe-replaces every \`{{slot}}\` with \`0\` before JSON.parse, so a
  quoted slot must sit inside a string and an unquoted slot must sit where a bare
  number/array is legal. Get this wrong and \`create_component\` returns
  "jsonld template is not valid JSON" — fix the quoting and retry.
- Bound string values are JSON-escaped at render, so a \`"\` in operator content
  can never break out of the literal — you do NOT escape them yourself.

## Required shape
Every template is a JSON OBJECT (never an array or scalar) and MUST carry:
- \`"@context": "https://schema.org"\`
- \`"@type": "..."\` — Product | Article | FAQPage | Recipe | BreadcrumbList | etc.
Missing either → the tool errors naming the missing key; add it and retry.

## Patterns per page type (copy, then fill slots)
- PRODUCT (a product/detail page):
  \`{"@context":"https://schema.org","@type":"Product","name":"{{title}}",
  "image":"{{image}}","description":"{{desc}}","offers":{"@type":"Offer",
  "price":{{price}},"priceCurrency":"{{currency}}","availability":"{{availability}}"},
  "aggregateRating":{"@type":"AggregateRating","ratingValue":{{rating}},
  "reviewCount":{{count}}}}\`
- ARTICLE (a blog post / news page):
  \`{"@context":"https://schema.org","@type":"Article","headline":"{{title}}",
  "image":"{{image}}","author":{"@type":"Person","name":"{{author}}"},
  "datePublished":"{{published}}","dateModified":"{{modified}}"}\`
- FAQPAGE (an FAQ / help page — each Q&A is one mainEntity item):
  \`{"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
  {"@type":"Question","name":"{{q}}","acceptedAnswer":{"@type":"Answer",
  "text":"{{a}}"}}]}\`
- RECIPE:
  \`{"@context":"https://schema.org","@type":"Recipe","name":"{{title}}",
  "image":"{{image}}","recipeIngredient":{{ingredients}},
  "recipeInstructions":"{{steps}}","totalTime":"{{totalTime}}"}\`
  (ingredients is an ARRAY → unquoted slot bound to a list value.)
- BREADCRUMBLIST is AUTOMATIC — the site already emits BreadcrumbList JSON-LD
  from the page tree. Do NOT author a breadcrumb jsonld component; it would double up.

## Binding slots to real data (dynamic per-URL structured data)
- Slots interpolate from the block's props exactly like HTML \`{{prop}}\` slots,
  so a jsonld component can be BOUND to data:
  - \`bind_component\` (collection or API) fills its slots from ONE item — use on a
    wildcard \`:param\` detail page so each URL gets correct per-item structured data.
  - Route values work too: a slot mapped to \`{ "param": "city-slug" }\` or
    \`{ "query": "q" }\` reads the wildcard match / URL query at render.
  This is WHY structured data is a component, not a static page field: dynamic
  pages get correct per-URL JSON-LD. See get_data_sources_guide for binding maps.

## Lists → structured data (TWO modes)
Drop a jsonld component as the TEMPLATE of a built-in List (create_list) and pick:
1. PER-ROW (default) — each row emits its OWN Product/Article script. Nothing
   special: create_list with the jsonld component as \`template\`, map its slots to
   fields, and you get N separate scripts (one per item). Use for a product grid
   where every card is its own rich result.
2. AGGREGATE ItemList — ONE \`ItemList\` script over all rows instead of N scripts.
   Opt in with \`bind_list\` \`itemList:true\` on the List (the row template must be a
   jsonld component; on a plain-HTML template it's a harmless no-op). Pass
   \`itemList:false\` to turn it back off. Use for a category/listing page that
   should present as a single ordered list to search engines.

## WHEN to author a jsonld component vs plain content
- Author a jsonld component when the page maps to a schema.org type that earns a
  RICH RESULT: products, articles/blog posts, FAQs, recipes, events, how-tos.
- Do NOT add JSON-LD for generic marketing/landing pages with no matching type —
  invalid or irrelevant structured data can hurt more than help.
- Do NOT duplicate the automatic BreadcrumbList.
- One jsonld component per schema type per page; bind it so dynamic pages stay correct.

## Errors are self-correcting — read them
The create_component / update_component error names the exact problem: bad slot
quoting → "not valid JSON" (fix the quotes), missing \`@context\`/\`@type\` (add it),
empty template (re-pass the COMPLETE template — update REPLACES, never send empty).
On such an error, fix the named issue and retry — do not repeat the same call.`;
