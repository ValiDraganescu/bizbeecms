/**
 * reference-scan — PURE reference walker for the delete guards (mcp-full-crud-patch T2).
 *
 * The Brief's contract: delete tools (delete_data_source, delete_data_source_request,
 * delete_collection) are BLOCKED while referenced, and the error names EVERY
 * referencing entity. This module is the shared scanner those guards call:
 * given plain JSON site content (pages, components, chat agents) and a delete
 * TARGET, it returns every reference — and `describeReferences` turns them into
 * the self-correcting error text (what blocks the delete + which tool removes
 * each reference), per the site's AI-error philosophy.
 *
 * Reference shapes covered (see lib/render/plan-types.ts):
 *  - block `bindings`   → BindingRef.source: kind "api" (sourceId/requestId) or
 *    "collection" (source.collection = tableName; ABSENT kind = collection, legacy)
 *  - block `listSource` → same collection|api duality
 *  - block `formTarget` → api (sourceId+requestId) or collection
 *  - chat agent `dataSources` allowlist entries (sourceId/requestId) and
 *    `collections` allowlist entries (collection = tableName)
 * Block trees are walked recursively (`children`), and BOTH live and draft
 * sets are scanned — a draft-only reference still blocks the delete (publishing
 * the draft would resurrect it).
 *
 * PURE: no `@/` / db / CF imports — runs under dep-free `node --test`
 * (scripts/reference-scan.test.mjs). The thin CF loader that feeds it real
 * rows is `reference-scan-load.ts`.
 */

// ── Targets ──────────────────────────────────────────────────────────────────

/** What is about to be deleted. */
export type ScanTarget =
  | { kind: "dataSource"; sourceId: string }
  | { kind: "dataSourceRequest"; sourceId: string; requestId: string }
  | { kind: "collection"; tableName: string };

// ── Inputs (plain JSON — the loader builds these from D1 rows) ──────────────

export interface ScanPage {
  id: string;
  /** Human label for errors — the page's path (e.g. "/menu") or title. */
  title: string;
  /** Live block tree (parsed `page.blocks`). Unparseable → pass []. */
  blocks: unknown;
  /** Draft block tree (the page's draft version), when one exists. */
  draftBlocks?: unknown;
}

export interface ScanComponent {
  id: string;
  name: string;
  /** Live element tree (parsed component html). */
  tree: unknown;
  /** Draft element tree, when the component has a draft. */
  draftTree?: unknown;
}

export interface ScanChatAgent {
  id: string;
  name: string;
  /** Parsed `chat_agent.dataSources` allowlist JSON (defensively walked). */
  dataSources: unknown;
  /** Parsed `chat_agent.collections` allowlist JSON (defensively walked). */
  collections: unknown;
}

export interface ScanInput {
  pages: ScanPage[];
  components: ScanComponent[];
  chatAgents: ScanChatAgent[];
}

// ── Output ───────────────────────────────────────────────────────────────────

/** Which reference shape matched. */
export type ReferenceWhere = "binding" | "list" | "form" | "allowlist";

export type Reference = {
  entity: "page" | "component" | "chatAgent";
  id: string;
  /** Human label: page title/path, component name, or agent name. */
  label: string;
  where: ReferenceWhere;
  /** Human detail, e.g. `block "b1" binding "temp"` or `dataSources entry "lookup_menu"`. */
  detail: string;
  /** Found only in a DRAFT block/tree set (drafts still block deletes). */
  draft: boolean;
};

// ── Matching ─────────────────────────────────────────────────────────────────

type SourceRef = {
  kind?: unknown;
  collection?: unknown;
  sourceId?: unknown;
  requestId?: unknown;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

/**
 * Does one source-shaped ref (BindingRef.source / ListSource / FormTarget /
 * agent allowlist entry) point at the target? Matches on the id fields, with
 * `kind` only as a veto — so the legacy "absent kind = collection" default and
 * FormTarget's kind-optional shape both match without per-shape special cases
 * (a collection ref never carries `sourceId`, an api ref never carries
 * `collection`, so the fields themselves discriminate).
 */
function refMatches(ref: SourceRef, target: ScanTarget): boolean {
  switch (target.kind) {
    case "collection":
      return ref.kind !== "api" && ref.collection === target.tableName;
    case "dataSource":
      return ref.kind !== "collection" && ref.sourceId === target.sourceId;
    case "dataSourceRequest":
      return (
        ref.kind !== "collection" &&
        ref.sourceId === target.sourceId &&
        ref.requestId === target.requestId
      );
  }
}

// ── Block/tree walk ──────────────────────────────────────────────────────────

/**
 * Recursively walk a block/element tree (any node with `children`), reporting
 * every `bindings` / `listSource` / `formTarget` that points at the target.
 * Shape-agnostic on purpose: page blocks and component trees share the walk
 * (a component tree carries none of these fields today, so it simply yields
 * nothing — but a future shape is caught for free).
 */
function walkNodes(
  nodes: unknown,
  target: ScanTarget,
  report: (where: ReferenceWhere, detail: string) => void,
): void {
  const list = Array.isArray(nodes) ? nodes : nodes !== undefined ? [nodes] : [];
  for (const node of list) {
    const block = asRecord(node);
    if (!block) continue; // text nodes etc.
    const blockId = typeof block.id === "string" ? `block "${block.id}"` : "a block";

    const bindings = asRecord(block.bindings);
    if (bindings) {
      for (const [prop, binding] of Object.entries(bindings)) {
        const source = asRecord(asRecord(binding)?.source);
        if (source && refMatches(source, target)) {
          report("binding", `${blockId} binding "${prop}"`);
        }
      }
    }

    const listSource = asRecord(block.listSource);
    if (listSource && refMatches(listSource, target)) {
      report("list", `List ${blockId}`);
    }

    const formTarget = asRecord(block.formTarget);
    if (formTarget && refMatches(formTarget, target)) {
      report("form", `Form ${blockId}`);
    }

    if (block.children !== undefined) walkNodes(block.children, target, report);
  }
}

// ── Agent allowlists ─────────────────────────────────────────────────────────

function scanAgent(agent: ScanChatAgent, target: ScanTarget, out: Reference[]): void {
  const push = (detail: string) =>
    out.push({
      entity: "chatAgent",
      id: agent.id,
      label: agent.name,
      where: "allowlist",
      detail,
      draft: false,
    });

  if (Array.isArray(agent.dataSources)) {
    for (const raw of agent.dataSources) {
      const entry = asRecord(raw);
      if (entry && refMatches(entry, target)) {
        const name = typeof entry.toolName === "string" ? ` "${entry.toolName}"` : "";
        push(`dataSources entry${name}`);
      }
    }
  }
  if (Array.isArray(agent.collections)) {
    for (const raw of agent.collections) {
      const entry = asRecord(raw);
      if (entry && refMatches(entry, target)) {
        const name = typeof entry.collection === "string" ? ` "${entry.collection}"` : "";
        push(`collections entry${name}`);
      }
    }
  }
}

// ── The scanner ──────────────────────────────────────────────────────────────

/**
 * Find every reference to `target` across the site's pages (live + draft
 * blocks), components (live + draft trees), and chat agent allowlists.
 * Empty result = safe to delete.
 */
export function findReferences(input: ScanInput, target: ScanTarget): Reference[] {
  const out: Reference[] = [];

  const scanSets = (
    entity: "page" | "component",
    id: string,
    label: string,
    live: unknown,
    draft: unknown,
  ) => {
    walkNodes(live, target, (where, detail) =>
      out.push({ entity, id, label, where, detail, draft: false }),
    );
    walkNodes(draft, target, (where, detail) => {
      // Skip a draft hit identical to a live one — the live line already names it.
      const dupe = out.some(
        (r) => r.entity === entity && r.id === id && r.where === where && r.detail === detail,
      );
      if (!dupe) out.push({ entity, id, label, where, detail, draft: true });
    });
  };

  for (const page of input.pages) {
    scanSets("page", page.id, page.title, page.blocks, page.draftBlocks);
  }
  for (const comp of input.components) {
    scanSets("component", comp.id, comp.name, comp.tree, comp.draftTree);
  }
  for (const agent of input.chatAgents) {
    scanAgent(agent, target, out);
  }
  return out;
}

// ── Error formatter (the delete guards' message) ─────────────────────────────

const ENTITY_NOUN: Record<Reference["entity"], string> = {
  page: "page",
  component: "component",
  chatAgent: "chat agent",
};

/** The tool that removes one reference — the "what to do" half of the error. */
function fixFor(ref: Reference, target: ScanTarget): string {
  switch (ref.where) {
    case "binding":
      return "clear or rebind it with bind_component";
    case "list":
      return "rebind it with bind_list";
    case "form":
      return "retarget or clear it with bind_form (clear: true)";
    case "allowlist":
      return target.kind === "collection"
        ? "remove it with remove_chat_agent_collection"
        : "remove it with remove_chat_agent_data_source";
  }
}

/** Human noun for the target, e.g. `data source "Weather API"`. */
function targetNoun(target: ScanTarget, targetName: string): string {
  switch (target.kind) {
    case "dataSource":
      return `data source "${targetName}"`;
    case "dataSourceRequest":
      return `saved request "${targetName}"`;
    case "collection":
      return `collection "${targetName}"`;
  }
}

/**
 * The delete guard's error text: names the target, EVERY referencing entity
 * (one line each: entity, where, and the tool that removes the reference),
 * and how to retry. Empty string when nothing references the target (caller
 * should then proceed with the delete, not show a message).
 */
export function describeReferences(
  target: ScanTarget,
  targetName: string,
  refs: Reference[],
): string {
  if (refs.length === 0) return "";
  const noun = targetNoun(target, targetName);
  const lines = refs.map((r) => {
    const draft = r.draft ? " (draft)" : "";
    return `- ${ENTITY_NOUN[r.entity]} "${r.label}": ${r.detail}${draft} — ${fixFor(r, target)}`;
  });
  const count = refs.length === 1 ? "1 place" : `${refs.length} places`;
  return [
    `Cannot delete ${noun}: it is still referenced in ${count}:`,
    ...lines,
    "Remove every reference listed above, then retry the delete.",
  ].join("\n");
}
