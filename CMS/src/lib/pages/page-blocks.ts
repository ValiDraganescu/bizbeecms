/**
 * Pure block-tree edit logic for the visual block editor (Milestone 2, epic C3)
 * — the NON-AI counterpart to the B3 `create_page` tool's block authoring.
 *
 * C2 (`page-meta.ts`) edits a page's METADATA and deliberately leaves blocks
 * alone. C3 is the missing half: visually compose/reorder a page's block tree.
 * This module owns the PURE concerns of that editor (so they're unit-tested with
 * the project's dep-free `node --test`):
 *
 *  - `validateBlocks` — gate a raw blocks array (from the editor OR the REST
 *    body, both untrusted) into a persistable `Block[]`, reusing the renderer's
 *    own `planPage` to reject anything un-renderable. Mirrors `page-tool.ts`'s
 *    block check but standalone (no slug/parent/meta — those are C2's).
 *  - `addBlock` / `removeBlock` / `moveBlock` — the immutable edit operations the
 *    editor's add / remove / reorder buttons apply to the TOP-LEVEL block list.
 *
 * One nesting level only this slice (top-level blocks). Block.children authored
 * by the AI's create_page still round-trip untouched (validate/persist walk the
 * whole tree); the visual editor just doesn't expose nested editing yet.
 *
 * PURE (no React / D1 / CF imports). Relative `.ts` import keeps it node-loadable.
 */

import { planPage, type Block } from "../render/tree.ts";

const ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/;

/**
 * Validate a raw blocks value (array, or JSON string of one) into a persistable
 * `Block[]`, collecting referenced component names. PURE — never throws/writes.
 * The route checks the names exist in D1 (this can't — no binding here).
 */
export function validateBlocks(
  raw: unknown,
): { ok: true; blocks: Block[]; componentNames: string[] } | { ok: false; errors: string[] } {
  let value = raw;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return { ok: false, errors: ["blocks must be a JSON array (or a JSON string of one)"] };
    }
  }
  if (!Array.isArray(value)) {
    return { ok: false, errors: ["blocks must be a JSON array of block objects"] };
  }

  const errors: string[] = [];
  const names = new Set<string>();
  const ids = new Set<string>();
  value.forEach((b, i) => walk(b, `blocks[${i}]`));

  if (errors.length === 0) {
    // Reuse the renderer's own walker (empty component map): unknown components
    // become hidden placeholders and never throw, so a throw = structurally broken.
    try {
      planPage(value as Block[], new Map());
    } catch (err) {
      errors.push(`blocks are not renderable: ${(err as Error).message}`);
    }
  }

  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, blocks: value as Block[], componentNames: [...names] };

  function walk(block: unknown, path: string): void {
    if (typeof block !== "object" || block === null || Array.isArray(block)) {
      errors.push(`${path} must be a block object`);
      return;
    }
    const b = block as Record<string, unknown>;
    if (typeof b.id !== "string" || !ID_RE.test(b.id)) {
      errors.push(`${path}.id must be a short identifier (letters, digits, -, _)`);
    } else if (ids.has(b.id)) {
      errors.push(`${path}.id "${b.id}" is duplicated (block ids must be unique)`);
    } else {
      ids.add(b.id);
    }
    if (typeof b.component !== "string" || b.component.trim() === "") {
      errors.push(`${path}.component must be a non-empty component name`);
    } else {
      names.add(b.component.trim());
    }
    if (b.props != null && (typeof b.props !== "object" || Array.isArray(b.props))) {
      errors.push(`${path}.props must be an object`);
    }
    if (b.children != null) {
      if (!Array.isArray(b.children)) {
        errors.push(`${path}.children must be an array of blocks`);
      } else {
        (b.children as unknown[]).forEach((c, i) => walk(c, `${path}.children[${i}]`));
      }
    }
  }
}

/** A fresh top-level block referencing `component`, with a unique generated id. */
export function makeBlock(component: string, existing: Block[]): Block {
  return { id: uniqueBlockId(component, existing), component };
}

/** Append a new block for `component` to the top-level list (immutable). */
export function addBlock(blocks: Block[], component: string): Block[] {
  return [...blocks, makeBlock(component, blocks)];
}

/** Remove the top-level block with `id` (immutable; no-op if absent). */
export function removeBlock(blocks: Block[], id: string): Block[] {
  return blocks.filter((b) => b.id !== id);
}

/**
 * Move the top-level block at `index` by `delta` (−1 up, +1 down), clamped to
 * the list bounds (immutable). Out-of-range index or a no-op move returns the
 * same array contents.
 */
export function moveBlock(blocks: Block[], index: number, delta: number): Block[] {
  const to = index + delta;
  if (index < 0 || index >= blocks.length || to < 0 || to >= blocks.length || delta === 0) {
    return [...blocks];
  }
  const next = [...blocks];
  const [moved] = next.splice(index, 1);
  next.splice(to, 0, moved);
  return next;
}

/** A block id unique within `existing`, derived from the component name. */
function uniqueBlockId(component: string, existing: Block[]): string {
  const base = component.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24) || "block";
  const taken = new Set(existing.map((b) => b.id));
  for (let n = 1; ; n++) {
    const id = `${base}-${n}`;
    if (!taken.has(id)) return id;
  }
}
