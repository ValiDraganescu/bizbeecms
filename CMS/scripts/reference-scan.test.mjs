/**
 * mcp-full-crud-patch T2 — tests for the PURE reference scanner
 * (src/lib/content/reference-scan.ts): every reference shape (block bindings /
 * listSource / formTarget in their collection|api dualities, agent allowlists),
 * recursive children, draft-vs-live sets, the no-references case, and the
 * delete-guard error formatter. The CF loader (reference-scan-load.ts) is
 * effects-only and build-verified — not tested here (store discipline).
 * Dep-free `node --test`; imports the REAL .ts via native type-stripping.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { findReferences, describeReferences } from "../src/lib/content/reference-scan.ts";

// ── fixtures ─────────────────────────────────────────────────────────────────

const DS = { kind: "dataSource", sourceId: "src-1" };
const REQ = { kind: "dataSourceRequest", sourceId: "src-1", requestId: "req-1" };
const COL = { kind: "collection", tableName: "content_menu" };

const emptySite = { pages: [], components: [], chatAgents: [] };

/** One page with the given blocks (and optional draft blocks). */
function site({ blocks = [], draftBlocks, components = [], chatAgents = [] } = {}) {
  return {
    pages: [{ id: "p1", title: "/menu", blocks, draftBlocks }],
    components,
    chatAgents,
  };
}

// ── no references ────────────────────────────────────────────────────────────

test("empty site → no references for any target", () => {
  assert.deepEqual(findReferences(emptySite, DS), []);
  assert.deepEqual(findReferences(emptySite, REQ), []);
  assert.deepEqual(findReferences(emptySite, COL), []);
});

test("unrelated content → no references", () => {
  const input = site({
    blocks: [
      { id: "b1", component: "Hero", props: { title: "hi" } },
      {
        id: "b2",
        component: "Card",
        bindings: { title: { source: { kind: "api", sourceId: "other" }, map: {} } },
        listSource: { kind: "collection", collection: "content_other" },
      },
    ],
    chatAgents: [
      {
        id: "a1",
        name: "Bot",
        dataSources: [{ sourceId: "other", requestId: "r", toolName: "t" }],
        collections: [{ collection: "content_other" }],
      },
    ],
  });
  assert.deepEqual(findReferences(input, DS), []);
  assert.deepEqual(findReferences(input, REQ), []);
  assert.deepEqual(findReferences(input, COL), []);
});

// ── block bindings ───────────────────────────────────────────────────────────

test("binding with kind api matches dataSource and dataSourceRequest targets", () => {
  const input = site({
    blocks: [
      {
        id: "b1",
        component: "Weather",
        bindings: { temp: { source: { kind: "api", sourceId: "src-1", requestId: "req-1" }, map: { temp: "main.temp" } } },
      },
    ],
  });
  const bySource = findReferences(input, DS);
  assert.equal(bySource.length, 1);
  assert.deepEqual(bySource[0], {
    entity: "page",
    id: "p1",
    label: "/menu",
    where: "binding",
    detail: 'block "b1" binding "temp"',
    draft: false,
  });
  assert.equal(findReferences(input, REQ).length, 1);
  // A DIFFERENT request of the same source: source target still hits, request target does not.
  assert.equal(
    findReferences(input, { kind: "dataSourceRequest", sourceId: "src-1", requestId: "req-other" }).length,
    0,
  );
});

test("binding with explicit collection kind matches the collection target", () => {
  const input = site({
    blocks: [
      { id: "b1", component: "Card", bindings: { name: { source: { kind: "collection", collection: "content_menu" }, map: {} } } },
    ],
  });
  assert.equal(findReferences(input, COL).length, 1);
  assert.equal(findReferences(input, DS).length, 0);
});

test("LEGACY binding with NO kind defaults to collection", () => {
  const input = site({
    blocks: [
      { id: "b1", component: "Card", bindings: { name: { source: { collection: "content_menu" }, map: {} } } },
    ],
  });
  const refs = findReferences(input, COL);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].where, "binding");
});

// ── listSource ───────────────────────────────────────────────────────────────

test("listSource matches in both collection and api forms", () => {
  const collectionList = site({
    blocks: [{ id: "b1", component: "List", listSource: { collection: "content_menu" } }],
  });
  const colRefs = findReferences(collectionList, COL);
  assert.equal(colRefs.length, 1);
  assert.equal(colRefs[0].where, "list");
  assert.equal(colRefs[0].detail, 'List block "b1"');

  const apiList = site({
    blocks: [{ id: "b2", component: "List", listSource: { kind: "api", sourceId: "src-1", requestId: "req-1" } }],
  });
  assert.equal(findReferences(apiList, DS).length, 1);
  assert.equal(findReferences(apiList, REQ).length, 1);
  assert.equal(findReferences(apiList, COL).length, 0);
});

// ── formTarget ───────────────────────────────────────────────────────────────

test("formTarget matches in both api and collection forms", () => {
  const apiForm = site({
    blocks: [{ id: "f1", component: "Form", formTarget: { kind: "api", sourceId: "src-1", requestId: "req-1" } }],
  });
  const refs = findReferences(apiForm, REQ);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].where, "form");
  assert.equal(refs[0].detail, 'Form block "f1"');

  const collectionForm = site({
    blocks: [{ id: "f2", component: "Form", formTarget: { kind: "collection", collection: "content_menu" } }],
  });
  assert.equal(findReferences(collectionForm, COL).length, 1);
  assert.equal(findReferences(collectionForm, DS).length, 0);
});

// ── recursion (children) ─────────────────────────────────────────────────────

test("references inside nested children are found", () => {
  const input = site({
    blocks: [
      {
        id: "sec",
        component: "Section",
        children: [
          {
            id: "col",
            component: "__section_column__",
            children: [{ id: "deep", component: "List", listSource: { collection: "content_menu" } }],
          },
        ],
      },
    ],
  });
  const refs = findReferences(input, COL);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].detail, 'List block "deep"');
});

// ── draft vs live ────────────────────────────────────────────────────────────

test("a DRAFT-only reference is reported with draft: true", () => {
  const input = site({
    blocks: [{ id: "b1", component: "Hero" }],
    draftBlocks: [{ id: "b2", component: "Form", formTarget: { kind: "api", sourceId: "src-1", requestId: "req-1" } }],
  });
  const refs = findReferences(input, DS);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].draft, true);
});

test("the same reference in live AND draft is reported once, as live", () => {
  const block = { id: "b1", component: "List", listSource: { collection: "content_menu" } };
  const input = site({ blocks: [block], draftBlocks: [block] });
  const refs = findReferences(input, COL);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].draft, false);
});

// ── components ───────────────────────────────────────────────────────────────

test("component element trees (no binding fields) yield nothing", () => {
  const input = {
    ...emptySite,
    components: [
      {
        id: "c1",
        name: "Hero",
        tree: { tag: "div", props: { class: "p-4" }, children: ["hello", { tag: "span", children: [] }] },
      },
    ],
  };
  assert.deepEqual(findReferences(input, COL), []);
});

test("a reference-shaped node in a component DRAFT tree is reported as the component", () => {
  const input = {
    ...emptySite,
    components: [
      {
        id: "c1",
        name: "MenuList",
        tree: { tag: "div", children: [] },
        draftTree: { tag: "div", children: [{ id: "x", listSource: { collection: "content_menu" } }] },
      },
    ],
  };
  const refs = findReferences(input, COL);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].entity, "component");
  assert.equal(refs[0].label, "MenuList");
  assert.equal(refs[0].draft, true);
});

// ── chat agent allowlists ────────────────────────────────────────────────────

test("agent dataSources entry matches dataSource and dataSourceRequest targets", () => {
  const input = {
    ...emptySite,
    chatAgents: [
      {
        id: "a1",
        name: "Booking Assistant",
        dataSources: [{ sourceId: "src-1", requestId: "req-1", toolName: "lookup_menu", description: "d" }],
        collections: [],
      },
    ],
  };
  const refs = findReferences(input, DS);
  assert.equal(refs.length, 1);
  assert.deepEqual(refs[0], {
    entity: "chatAgent",
    id: "a1",
    label: "Booking Assistant",
    where: "allowlist",
    detail: 'dataSources entry "lookup_menu"',
    draft: false,
  });
  assert.equal(findReferences(input, REQ).length, 1);
  assert.equal(
    findReferences(input, { kind: "dataSourceRequest", sourceId: "src-1", requestId: "req-other" }).length,
    0,
  );
});

test("agent collections entry matches the collection target", () => {
  const input = {
    ...emptySite,
    chatAgents: [
      {
        id: "a1",
        name: "Bot",
        dataSources: [],
        collections: [{ collection: "content_menu", description: "d", canQuery: true }],
      },
    ],
  };
  const refs = findReferences(input, COL);
  assert.equal(refs.length, 1);
  assert.equal(refs[0].detail, 'collections entry "content_menu"');
  assert.equal(findReferences(input, DS).length, 0);
});

test("malformed allowlists (non-arrays, junk entries) are walked defensively", () => {
  const input = {
    ...emptySite,
    chatAgents: [
      { id: "a1", name: "Bot", dataSources: "not json", collections: [null, 42, { collection: "content_menu" }] },
    ],
  };
  const refs = findReferences(input, COL);
  assert.equal(refs.length, 1);
});

// ── describeReferences (the delete-guard error) ──────────────────────────────

test("describeReferences: no references → empty string", () => {
  assert.equal(describeReferences(DS, "Weather API", []), "");
});

test("describeReferences names the target, every reference, its fix tool, and the retry", () => {
  const input = {
    pages: [
      {
        id: "p1",
        title: "/home",
        blocks: [
          { id: "b1", component: "Weather", bindings: { temp: { source: { kind: "api", sourceId: "src-1", requestId: "req-1" }, map: {} } } },
          { id: "b2", component: "List", listSource: { kind: "api", sourceId: "src-1", requestId: "req-2" } },
        ],
        draftBlocks: [
          { id: "b3", component: "Form", formTarget: { kind: "api", sourceId: "src-1", requestId: "req-1" } },
        ],
      },
    ],
    components: [],
    chatAgents: [
      { id: "a1", name: "Booking Assistant", dataSources: [{ sourceId: "src-1", requestId: "req-1", toolName: "lookup" }], collections: [] },
    ],
  };
  const refs = findReferences(input, DS);
  assert.equal(refs.length, 4);
  const msg = describeReferences(DS, "Weather API", refs);
  assert.equal(msg.split("\n")[0], 'Cannot delete data source "Weather API": it is still referenced in 4 places:');
  assert.match(msg, /- page "\/home": block "b1" binding "temp" — clear or rebind it with bind_component/);
  assert.match(msg, /- page "\/home": List block "b2" — rebind it with bind_list/);
  assert.match(msg, /- page "\/home": Form block "b3" \(draft\) — retarget or clear it with bind_form \(clear: true\)/);
  assert.match(msg, /- chat agent "Booking Assistant": dataSources entry "lookup" — remove it with remove_chat_agent_data_source/);
  assert.match(msg, /Remove every reference listed above, then retry the delete\.$/);
});

test("describeReferences: collection target uses the collection nouns and tools", () => {
  const input = site({
    blocks: [{ id: "b1", component: "List", listSource: { collection: "content_menu" } }],
    chatAgents: [{ id: "a1", name: "Bot", dataSources: [], collections: [{ collection: "content_menu" }] }],
  });
  const msg = describeReferences(COL, "Menu", findReferences(input, COL));
  assert.match(msg, /^Cannot delete collection "Menu": it is still referenced in 2 places:/);
  assert.match(msg, /remove it with remove_chat_agent_collection/);
});

test("describeReferences: singular count reads '1 place'", () => {
  const input = site({
    blocks: [{ id: "b1", component: "List", listSource: { kind: "api", sourceId: "src-1", requestId: "req-1" } }],
  });
  const msg = describeReferences(REQ, "get_menu", findReferences(input, REQ));
  assert.match(msg, /^Cannot delete saved request "get_menu": it is still referenced in 1 place:/);
});
