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

/** Current bundle format version. Bump when the envelope shape changes. */
export const PORTABLE_FORMAT = "bizbeecms.component";
export const PORTABLE_VERSION = 1 as const;

// propsSchema is opaque JSON metadata (the AI/import hint). Bound it so a bundle
// can't smuggle a multi-MB blob; it's never eval'd, only stored + shown.
const MAX_PROPS_SCHEMA_BYTES = 16 * 1024;

/** A self-contained, portable component bundle. */
export interface PortableComponent {
  format: typeof PORTABLE_FORMAT;
  version: typeof PORTABLE_VERSION;
  /** Free-text provenance/notes (optional, bounded, never executed). */
  meta?: { exportedAt?: string; note?: string };
  component: {
    name: string;
    tree: TreeNode;
    script: string;
    css: string;
    propsSchema: string | null;
  };
}

/** The DB row shape we serialize from (a subset of the `component` table). */
export interface ComponentRow {
  name: string;
  tree: string; // JSON string in D1
  script: string;
  css: string;
  propsSchema: string | null;
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
  return {
    format: PORTABLE_FORMAT,
    version: PORTABLE_VERSION,
    ...(meta ? { meta } : {}),
    component: {
      name: row.name,
      tree,
      script: row.script ?? "",
      css: row.css ?? "",
      propsSchema: row.propsSchema ?? null,
    },
  };
}

/** The validated, ready-to-upsert import result. */
export interface ImportedComponent {
  name: string;
  tree: TreeNode;
  script: string;
  css: string;
  propsSchema: string | null;
}

/**
 * H2 — parse + validate an UNTRUSTED bundle (object, or a JSON string of one)
 * into a persistable component, or return the problems. PURE — never throws,
 * never writes. This is the IMPORT trust boundary.
 */
export function parsePortableComponent(
  raw: unknown,
): { ok: true; component: ImportedComponent } | { ok: false; errors: string[] } {
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

  // ── the artifact itself: reuse the SAME gate the AI tool uses ──
  // (renderable tree, allowed utility classes, bounded script, safe name).
  const v = validateComponentArtifact({
    name: c.name,
    tree: c.tree,
    script: c.script,
    css: c.css,
  });
  if (!v.ok) errors.push(...v.errors);

  if (errors.length > 0 || !v.ok) return { ok: false, errors };

  return {
    ok: true,
    component: { ...v.artifact, propsSchema },
  };
}

function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}
