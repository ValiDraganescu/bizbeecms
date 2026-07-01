/**
 * "Where is this component used?" — the PURE blast-radius computation.
 *
 * Editing a component resolves BY REFERENCE at render, so a change to component
 * X affects every page whose rendered tree reaches X — directly (a block names X)
 * OR transitively (a block names component A, whose tree references X via a
 * PascalCase composition tag). This module computes that closure from plain data
 * so it's node-testable; the store wrapper (`component-store`) loads the rows.
 *
 * Two inputs:
 *   - `pages`: each page's id/slug/title + the set of component names its blocks
 *     reference at top level (from `collectComponentNames` over the page blocks).
 *   - `deps`: componentName → the set of component names ITS tree references
 *     (from `collectTreeComponentTags` over each component's parsed tree).
 *
 * Output: the pages that reach `target`, each tagged direct vs transitive.
 */

/** One page's reference surface (its directly-referenced component names). */
export type PageRefs = {
  id: string;
  slug: string;
  title?: string;
  /** Component names the page's blocks reference directly. */
  components: string[];
};

/** componentName → component names referenced inside its tree (composition tags). */
export type ComponentDeps = Map<string, Set<string>>;

export type Usage = {
  pageId: string;
  slug: string;
  title?: string;
  /** true = a block on the page names the target directly; false = only via a dep. */
  direct: boolean;
};

/**
 * The set of components `start` reaches (itself + everything its tree pulls in,
 * transitively), following `deps`. Cycle-safe (a visited set). Used to expand a
 * page's DIRECT references into everything it actually renders.
 */
function closure(start: Iterable<string>, deps: ComponentDeps): Set<string> {
  const seen = new Set<string>();
  const stack = [...start];
  while (stack.length) {
    const name = stack.pop()!;
    if (seen.has(name)) continue;
    seen.add(name);
    const next = deps.get(name);
    if (next) for (const n of next) if (!seen.has(n)) stack.push(n);
  }
  return seen;
}

/**
 * Which pages reach `target`. A page is DIRECT if one of its own block
 * references is the target; otherwise TRANSITIVE if the target shows up only
 * after expanding those references through component→component deps. Pages that
 * never reach the target are omitted. Sorted direct-first, then by slug.
 */
export function findComponentUsage(
  target: string,
  pages: PageRefs[],
  deps: ComponentDeps,
): Usage[] {
  const out: Usage[] = [];
  for (const page of pages) {
    const direct = page.components.includes(target);
    const reaches = direct || closure(page.components, deps).has(target);
    if (reaches) out.push({ pageId: page.id, slug: page.slug, title: page.title, direct });
  }
  out.sort((a, b) =>
    a.direct === b.direct ? a.slug.localeCompare(b.slug) : a.direct ? -1 : 1,
  );
  return out;
}
