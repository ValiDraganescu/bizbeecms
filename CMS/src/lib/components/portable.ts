/**
 * Portable component export/import format (Milestone 2, epic H1/H2).
 *
 * A component is already pure data (`{ name, tree, script, css, propsSchema }`,
 * see schema.ts / B2), so it can be moved between Sites as a self-contained JSON
 * "bundle". This module owns the PURE, offline-testable serialize/parse contract:
 *
 *  - `serializeComponent(row)`  → a versioned `PortableComponent` envelope (H1).
 *  - `parsePortableComponent(raw)` → validate an UNTRUSTED bundle on IMPORT (H2).
 *
 * IMPORT IS A TRUST BOUNDARY. A bundle may come from another Site, a file, or a
 * paste box — treat it like the AI's tool output. `parsePortableComponent`
 * re-runs the SAME `validateComponentArtifact` gate the AI path uses (renderable
 * tree, bounded utility-class allowlist, size-bounded script, safe name) plus an
 * envelope shape/version check. No server eval ever happens — `tree` is a data
 * walk and `script` is forwarded to the browser as text, never run on the server.
 *
 * PURE (no React/D1/CF imports) so it's unit-tested with the dep-free node --test.
 * Relative `.ts` imports for the same reason (see CAVEATS).
 */

import { validateComponentArtifact } from "../chat/component-tool.ts";
import type { TreeNode } from "../render/tree.ts";
import { ASSET_URL_PREFIX, isValidAssetKey } from "../render/asset.ts";
import { normalizeTags } from "./tags.ts";

/** Current bundle format version. Bump when the envelope shape changes. */
export const PORTABLE_FORMAT = "bizbeecms.component";
export const PORTABLE_VERSION = 1 as const;

/** Kit-bundle format version (a tag exported as a multi-component UI kit). */
export const KIT_FORMAT = "bizbeecms.kit";
export const KIT_VERSION = 1 as const;

/**
 * H3 — asset-URL dependency handling.
 *
 * A component's tree/script/css can embed `/media/<key>` URLs that point at the
 * SOURCE Site's R2 bucket. Moving the component to another Site leaves those
 * references dangling (the target Site's R2 has no such object). So the portable
 * format DECLARES its asset deps (the set of `/media/<key>` keys it references)
 * at export time, and the importer can inspect/rebind them before the upsert.
 *
 * Only the KNOWN, SAFE `/media/<key>` shape is enumerated/rewritten — `key` must
 * pass `isValidAssetKey` (the same traversal-guarded shape the serve route
 * accepts). Anything else (external URLs, odd paths) is left untouched, so a
 * rebind can never smuggle in a path-traversal or a foreign-origin reference.
 */
// Match `/media/<key>` where <key> is the asset-key shape. Captures the key.
const MEDIA_URL_RE = new RegExp(
  `${ASSET_URL_PREFIX.replace(/[/]/g, "\\/")}(assets\\/[a-z0-9][a-z0-9_]*_\\d+_[a-z0-9]+\\.[a-z0-9]+)`,
  "g",
);

// propsSchema is opaque JSON metadata (the AI/import hint). Bound it so a bundle
// can't smuggle a multi-MB blob; it's never eval'd, only stored + shown.
const MAX_PROPS_SCHEMA_BYTES = 16 * 1024;

/**
 * H3b — nested-component dependency handling.
 *
 * A component's tree can reference ANOTHER component by name. The JSX/React
 * convention (and what the renderer's React adapter honours): a `tag` that
 * starts with an UPPERCASE letter is a component reference; a lowercase `tag`
 * is a plain HTML element. So a bundle whose tree contains `{ tag: "AuthorCard" }`
 * depends on a component named `AuthorCard` existing in the target Site.
 *
 * H3 handled ASSET-URL deps; this is the component→component dep gap. We only
 * enumerate the KNOWN-SAFE component-name shape (`COMPONENT_TAG_RE`, the same
 * PascalCase identifier `validateComponentArtifact` accepts as a `name`) so the
 * warning can't be poisoned by an odd tag value. We DON'T auto-install — we just
 * surface missing deps so the human installs them first (matching the asset-dep
 * posture: warn, don't act).
 */
// A `tag` that names another component: starts uppercase, identifier shape.
// Mirrors the component NAME_RE in component-tool.ts (PascalCase-ish identifier).
const COMPONENT_TAG_RE = /^[A-Z][A-Za-z0-9_-]{0,63}$/;

/** A self-contained, portable component bundle. */
export interface PortableComponent {
  format: typeof PORTABLE_FORMAT;
  version: typeof PORTABLE_VERSION;
  /** Free-text provenance/notes (optional, bounded, never executed). */
  meta?: { exportedAt?: string; note?: string };
  /**
   * Asset deps (H3): the SOURCE-Site `/media/<key>` keys this component
   * references. The importer uses this to tell the user what assets the bundle
   * needs (and what to rebind) before installing into another Site. Declared at
   * export time; advisory — the source of truth is always a fresh enumeration.
   */
  assets: string[];
  /**
   * Nested-component deps (H3b): the distinct names of OTHER components this
   * bundle's tree renders (a `tag` in PascalCase = a component reference). The
   * importer warns when any are missing from the target Site so the human
   * installs them first (we never auto-install). Self-references are excluded.
   */
  componentDeps: string[];
  /**
   * Free-form operator tags carried across export/import (component-kits goal).
   * Normalized on serialize and re-normalized on parse, so tags survive the
   * round-trip but an untrusted bundle can't smuggle junk into the column.
   */
  tags: string[];
  component: {
    name: string;
    tree: TreeNode;
    script: string;
    css: string;
    propsSchema: string | null;
  };
}

/**
 * Enumerate the distinct, sorted `/media/<key>` asset keys referenced anywhere
 * in a component artifact (tree text + string prop values, script, css). PURE.
 * Only the known safe shape is collected — see MEDIA_URL_RE.
 */
export function enumerateAssetDeps(parts: {
  tree: TreeNode;
  script?: string;
  css?: string;
}): string[] {
  const keys = new Set<string>();
  const scan = (s: string) => {
    for (const m of s.matchAll(MEDIA_URL_RE)) {
      if (isValidAssetKey(m[1])) keys.add(m[1]);
    }
  };
  // Walk the tree, scanning text nodes and string prop values.
  const walk = (node: TreeNode) => {
    if (typeof node === "string") return scan(node);
    if (node.props) {
      for (const v of Object.values(node.props)) {
        if (typeof v === "string") scan(v);
      }
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(parts.tree);
  if (parts.script) scan(parts.script);
  if (parts.css) scan(parts.css);
  return [...keys].sort();
}

/**
 * Enumerate the distinct, sorted component NAMES a tree references (H3b). A node
 * whose `tag` matches `COMPONENT_TAG_RE` (PascalCase identifier) is a nested
 * component dep. PURE — text nodes and lowercase HTML tags are ignored.
 */
export function enumerateComponentDeps(tree: TreeNode): string[] {
  const names = new Set<string>();
  const walk = (node: TreeNode) => {
    if (typeof node === "string") return;
    if (typeof node.tag === "string" && COMPONENT_TAG_RE.test(node.tag)) {
      names.add(node.tag);
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return [...names].sort();
}

/**
 * Rebind map applied on import (H3): for each source asset key, either a target
 * key (oldKey → newKey, rewriting `/media/<old>` → `/media/<new>`) or `null`
 * (strip the URL to "" — a placeholder/missing default). Keys/values not in the
 * known safe shape are ignored, so rebind can't introduce unsafe references.
 */
export type AssetRebind = Record<string, string | null>;

/** Rewrite `/media/<key>` URLs in a string using the rebind map. PURE. */
function rebindString(s: string, rebind: AssetRebind): string {
  return s.replace(MEDIA_URL_RE, (whole, key: string) => {
    if (!isValidAssetKey(key) || !(key in rebind)) return whole;
    const target = rebind[key];
    if (target === null) return ""; // strip → unbound/placeholder
    if (typeof target === "string" && isValidAssetKey(target)) {
      return ASSET_URL_PREFIX + target;
    }
    return whole; // unsafe target → leave original untouched
  });
}

/** Apply a rebind map to a tree's text + string props. PURE, immutable. */
function rebindTree(node: TreeNode, rebind: AssetRebind): TreeNode {
  if (typeof node === "string") return rebindString(node, rebind);
  const props = node.props
    ? Object.fromEntries(
        Object.entries(node.props).map(([k, v]) => [
          k,
          typeof v === "string" ? rebindString(v, rebind) : v,
        ]),
      )
    : node.props;
  return {
    ...node,
    ...(props ? { props } : {}),
    ...(node.children ? { children: node.children.map((c) => rebindTree(c, rebind)) } : {}),
  };
}

/** The DB row shape we serialize from (a subset of the `component` table). */
export interface ComponentRow {
  name: string;
  tree: string; // JSON string in D1
  script: string;
  css: string;
  propsSchema: string | null;
  /** JSON-string array of operator tags in D1; normalized on serialize. */
  tags?: string | null;
}

/**
 * H1 — serialize a stored component row into a portable bundle. The `tree` column
 * is a JSON string in D1; we parse it back to an object for a clean envelope
 * (falls back to an empty node if the stored JSON is somehow corrupt, so export
 * never throws). PURE.
 */
export function serializeComponent(
  row: ComponentRow,
  meta?: { exportedAt?: string; note?: string },
): PortableComponent {
  let tree: TreeNode;
  try {
    tree = JSON.parse(row.tree) as TreeNode;
  } catch {
    tree = { tag: "div", props: {}, children: [] };
  }
  const script = row.script ?? "";
  const css = row.css ?? "";
  let tags: string[];
  try {
    tags = normalizeTags(row.tags ? JSON.parse(row.tags) : []);
  } catch {
    tags = [];
  }
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    ...(meta ? { meta } : {}),
    assets: enumerateAssetDeps({ tree, script, css }),
    // Other components this one renders, minus a self-reference.
    componentDeps: enumerateComponentDeps(tree).filter((n) => n !== row.name),
    tags,
    component: {
      name: row.name,
      tree,
      script,
      css,
      propsSchema: row.propsSchema ?? null,
    },
  };
}

/**
 * A UI kit: a tag exported as ONE bundle of portable components (component-kits
 * Slice 3). It just wraps the EXISTING per-component `PortableComponent` envelope
 * — no second serialization path. `assets` / `componentDeps` are the deduped
 * union across every component (so the importer sees the whole kit's deps), and
 * `tag` records which tag produced it (also the default name).
 */
export interface KitBundle {
  format: typeof KIT_FORMAT;
  version: typeof KIT_VERSION;
  name: string;
  tag: string;
  meta?: { exportedAt?: string; note?: string };
  /** Deduped, sorted union of every component's `/media/<key>` asset deps. */
  assets: string[];
  /** Deduped, sorted union of nested-component deps NOT satisfied within the kit. */
  componentDeps: string[];
  components: PortableComponent[];
}

/**
 * Build a kit bundle from the component rows carrying `tag` (component-kits
 * Slice 3). REUSES `serializeComponent` per component (so each carries its own
 * asset/component deps + tags) and unions+dedupes the deps across the kit. The
 * caller is responsible for selecting the rows (e.g. `filterByTag`); this is
 * PURE so it's offline-testable. Component deps satisfied by ANOTHER component in
 * the same kit are dropped from the kit-level `componentDeps` (the kit installs
 * them itself), leaving only EXTERNAL deps the target Site must already have.
 */
export function buildKitBundle(
  rows: ComponentRow[],
  tag: string,
  meta?: { exportedAt?: string; note?: string },
): KitBundle {
  const components = rows.map((r) => serializeComponent(r, meta));
  const names = new Set(components.map((c) => c.component.name));
  const assets = new Set<string>();
  const componentDeps = new Set<string>();
  for (const c of components) {
    for (const a of c.assets) assets.add(a);
    // Only deps NOT installed by the kit itself are external (target must have).
    for (const d of c.componentDeps) if (!names.has(d)) componentDeps.add(d);
  }
  return {
    format: KIT_FORMAT,
    version: KIT_VERSION,
    name: tag,
    tag,
    ...(meta ? { meta } : {}),
    assets: [...assets].sort(),
    componentDeps: [...componentDeps].sort(),
    components,
  };
}

/**
 * Parse + validate an UNTRUSTED kit bundle (component-kits Slice 4). PURE — never
 * throws, never writes. The kit envelope (`bizbeecms.kit`) is checked for
 * format/version + a `components` array, then EACH element runs through the
 * EXISTING `parsePortableComponent` per-component trust boundary (never bypassed —
 * a kit is no more trusted than a single import).
 *
 * Partial-tolerant by design (mirrors single-import's "report skipped" posture):
 * a component that fails validation is collected in `errors` (with its index +
 * name) and SKIPPED; the valid components are returned ready to upsert. A bad
 * envelope (wrong format/version/shape) fails the WHOLE bundle (no components).
 * `assets`/`componentDeps` are the deduped union across the VALID components.
 */
export function parseKitBundle(
  raw: unknown,
):
  | {
      ok: true;
      name: string;
      tag: string;
      components: ImportedComponent[];
      assets: string[];
      componentDeps: string[];
      errors: string[];
    }
  | { ok: false; errors: string[] } {
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ["kit bundle is not valid JSON"] };
    }
  }
  if (typeof obj !== "object" || obj === null) {
    return { ok: false, errors: ["kit bundle must be a JSON object"] };
  }
  const b = obj as Record<string, unknown>;

  // ── envelope (a malformed envelope fails the whole bundle) ──
  const envErrors: string[] = [];
  if (b.format !== KIT_FORMAT) envErrors.push(`format must be "${KIT_FORMAT}"`);
  if (b.version !== KIT_VERSION) {
    envErrors.push(`unsupported version (expected ${KIT_VERSION}, got ${String(b.version)})`);
  }
  if (!Array.isArray(b.components)) envErrors.push("kit.components must be an array");
  if (envErrors.length > 0) return { ok: false, errors: envErrors };

  const tag = typeof b.tag === "string" ? b.tag : "";
  const name = typeof b.name === "string" && b.name !== "" ? b.name : tag;

  // ── per-component trust boundary: validate EACH, skip + record the bad ones ──
  const components: ImportedComponent[] = [];
  const assets = new Set<string>();
  const componentDeps = new Set<string>();
  const errors: string[] = [];
  const list = b.components as unknown[];
  list.forEach((raw, i) => {
    const parsed = parsePortableComponent(raw);
    if (!parsed.ok) {
      const nm =
        raw && typeof raw === "object"
          ? String((raw as { component?: { name?: unknown } }).component?.name ?? "?")
          : "?";
      errors.push(`component #${i} (${nm}): ${parsed.errors.join("; ")}`);
      return;
    }
    components.push(parsed.component);
    for (const a of parsed.assets) assets.add(a);
    for (const d of parsed.componentDeps) componentDeps.add(d);
  });

  // In-kit deps are satisfied by the kit itself → only EXTERNAL deps remain.
  const installed = new Set(components.map((c) => c.name));
  return {
    ok: true,
    name,
    tag,
    components,
    assets: [...assets].sort(),
    componentDeps: [...componentDeps].filter((d) => !installed.has(d)).sort(),
    errors,
  };
}

/**
 * A read-only preview of what installing a kit bundle WOULD do (component-kits:
 * preview-before-install). PURE — never writes. Reuses `parseKitBundle` (so the
 * same trust boundary decides what's valid) and folds in the set of component
 * names that ALREADY exist on the target Site so the UI can show created-vs-
 * updated per component, the kit's tags, and any unresolved deps — all BEFORE the
 * operator commits the install.
 */
export interface KitPreview {
  ok: boolean;
  name: string;
  tag: string;
  /** One row per VALID component, in bundle order. */
  components: { name: string; tags: string[]; action: "create" | "update" }[];
  /** Distinct, sorted union of every valid component's tags. */
  tags: string[];
  /** External `/media/<key>` asset deps the kit references (deduped). */
  assets: string[];
  /** External component deps not satisfied within the kit AND missing on the Site. */
  missingComponents: string[];
  /** Per-component validation failures that would be SKIPPED on install. */
  errors: string[];
}

/**
 * Summarize an UNTRUSTED kit bundle into a preview (no D1 write). `existingNames`
 * is the set of component names already on this Site (so each row is create vs
 * update) and `siteComponentNames` lets us narrow external deps to the ones the
 * Site is actually MISSING. PURE so it's offline-testable; the route supplies the
 * two name sets from D1.
 */
export function summarizeKitBundle(
  raw: unknown,
  existingNames: Iterable<string> = [],
): KitPreview {
  const parsed = parseKitBundle(raw);
  if (!parsed.ok) {
    return {
      ok: false,
      name: "",
      tag: "",
      components: [],
      tags: [],
      assets: [],
      missingComponents: [],
      errors: parsed.errors,
    };
  }
  const existing = new Set(existingNames);
  const tags = new Set<string>();
  const components = parsed.components.map((c) => {
    for (const t of c.tags) tags.add(t);
    return {
      name: c.name,
      tags: c.tags,
      action: (existing.has(c.name) ? "update" : "create") as "create" | "update",
    };
  });
  // The bundle's external componentDeps that the Site does NOT already have.
  const missingComponents = parsed.componentDeps.filter((d) => !existing.has(d));
  return {
    ok: true,
    name: parsed.name,
    tag: parsed.tag,
    components,
    tags: [...tags].sort(),
    assets: parsed.assets,
    missingComponents,
    errors: parsed.errors,
  };
}

/** The validated, ready-to-upsert import result. */
export interface ImportedComponent {
  name: string;
  tree: TreeNode;
  script: string;
  css: string;
  propsSchema: string | null;
  /** Operator tags, re-normalized from the bundle envelope (untrusted input). */
  tags: string[];
}

/** Options for the import trust boundary (H3). */
export interface ParseOptions {
  /**
   * Apply an asset rebind map BEFORE validation (oldKey → newKey, or null to
   * strip). Only known safe `/media/<key>` shapes are rewritten; everything
   * else is left untouched. The result still goes through the SAME
   * `validateComponentArtifact` gate — no separate write/validation path.
   */
  rebind?: AssetRebind;
}

/**
 * H2/H3 — parse + validate an UNTRUSTED bundle (object, or a JSON string of one)
 * into a persistable component, or return the problems. PURE — never throws,
 * never writes. This is the IMPORT trust boundary.
 *
 * On success it also returns `assets`: the `/media/<key>` deps the (rebound)
 * component still references, and `componentDeps`: the names of OTHER components
 * its tree references — so the caller can warn the importer about assets OR
 * components the target Site is missing. Both are re-enumerated from the
 * VALIDATED artifact, never trusted from the envelope.
 */
export function parsePortableComponent(
  raw: unknown,
  opts: ParseOptions = {},
):
  | { ok: true; component: ImportedComponent; assets: string[]; componentDeps: string[] }
  | { ok: false; errors: string[] } {
  // Accept a JSON string (file/paste) or an already-parsed object.
  let obj: unknown = raw;
  if (typeof raw === "string") {
    try {
      obj = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ["bundle is not valid JSON"] };
    }
  }
  if (typeof obj !== "object" || obj === null) {
    return { ok: false, errors: ["bundle must be a JSON object"] };
  }
  const b = obj as Record<string, unknown>;

  const errors: string[] = [];

  // ── envelope ──
  if (b.format !== PORTABLE_FORMAT) {
    errors.push(`format must be "${PORTABLE_FORMAT}"`);
  }
  if (b.version !== PORTABLE_VERSION) {
    errors.push(
      `unsupported version (expected ${PORTABLE_VERSION}, got ${String(b.version)})`,
    );
  }
  if (typeof b.component !== "object" || b.component === null) {
    errors.push("bundle.component must be an object");
    return { ok: false, errors };
  }
  const c = b.component as Record<string, unknown>;

  // ── propsSchema (optional metadata; bounded, must be a JSON string or null) ──
  let propsSchema: string | null = null;
  if (c.propsSchema !== undefined && c.propsSchema !== null) {
    if (typeof c.propsSchema !== "string") {
      errors.push("component.propsSchema must be a JSON string or null");
    } else if (byteLength(c.propsSchema) > MAX_PROPS_SCHEMA_BYTES) {
      errors.push(`component.propsSchema exceeds ${MAX_PROPS_SCHEMA_BYTES} bytes`);
    } else {
      try {
        JSON.parse(c.propsSchema);
        propsSchema = c.propsSchema;
      } catch {
        errors.push("component.propsSchema must be valid JSON");
      }
    }
  }

  // ── H3: optionally rebind asset URLs BEFORE validation ──
  // We only rebind a tree we can parse as an object; an unparseable/invalid
  // tree falls through to validateComponentArtifact, which reports it.
  let tree = c.tree;
  let script = c.script;
  let css = c.css;
  if (opts.rebind) {
    const treeObj = coerceTreeNode(c.tree);
    if (treeObj !== null) tree = rebindTree(treeObj, opts.rebind);
    if (typeof script === "string") script = rebindString(script, opts.rebind);
    if (typeof css === "string") css = rebindString(css, opts.rebind);
  }

  // ── the artifact itself: reuse the SAME gate the AI tool uses ──
  // (renderable tree, allowed utility classes, bounded script, safe name).
  const v = validateComponentArtifact({ name: c.name, tree, script, css });
  if (!v.ok) errors.push(...v.errors);

  if (errors.length > 0 || !v.ok) return { ok: false, errors };

  // Tags are advisory metadata (top-level envelope field). Re-normalize the
  // untrusted value — never trust the bundle's spelling/shape into the column.
  const tags = normalizeTags(b.tags);

  return {
    ok: true,
    component: { ...v.artifact, propsSchema, tags },
    // Deps remaining AFTER any rebind — what the target Site must actually have.
    assets: enumerateAssetDeps(v.artifact),
    // Other components this one renders, minus a self-reference (H3b).
    componentDeps: enumerateComponentDeps(v.artifact.tree).filter(
      (n) => n !== v.artifact.name,
    ),
  };
}

/** Parse a tree that may be an object or a JSON string into a TreeNode, or null. */
function coerceTreeNode(raw: unknown): TreeNode | null {
  let val: unknown = raw;
  if (typeof raw === "string") {
    try {
      val = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (typeof val === "string") return val;
  if (val && typeof val === "object" && typeof (val as { tag?: unknown }).tag === "string") {
    return val as TreeNode;
  }
  return null;
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
