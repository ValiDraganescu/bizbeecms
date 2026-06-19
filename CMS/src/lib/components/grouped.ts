/**
 * Pure grouping helper for the page-builder Components rail (page-builder epic).
 *
 * Closes the kit↔component GAP: components are stored FLAT in D1, each tagged
 * with an optional `sourceKit` id (set when installed via a premade kit). The
 * rail wants them GROUPED — one expandable group per installed kit, plus a final
 * "individually-imported" group for components with no `sourceKit`.
 *
 * This is pure data shaping (no D1, no fetch) so it's trivially testable. The
 * endpoint (`GET /api/components/grouped`) reads `listComponentsWithKit()` +
 * the kit manifest and feeds them here.
 */

/** A component name + the kit it came from (null = individually imported). */
export interface NamedKitComponent {
  name: string;
  sourceKit: string | null;
}

/** One group in the rail: a kit (or the "ungrouped" bucket) + its components. */
export interface ComponentGroup {
  /** Kit id ("blog"/"landing"/"docs") or null for the individually-imported bucket. */
  kit: string | null;
  /** Component names in this group, sorted alphabetically. */
  components: string[];
}

/**
 * Group flat tagged components into per-kit groups + a trailing "ungrouped" group.
 *
 * - `kitOrder` lists every kit id whose group should appear (in this order), even
 *   if it currently has 0 installed components — so the rail can show "no
 *   components from this kit yet" rather than hiding the kit entirely. A component
 *   tagged with a kit id NOT in `kitOrder` falls into that kit's group anyway
 *   (appended after the known order), so a stale tag is never silently dropped.
 * - The `null` (individually-imported) group is always last and only present when
 *   there's at least one untagged component.
 */
export function groupComponentsByKit(
  components: NamedKitComponent[],
  kitOrder: string[] = [],
): ComponentGroup[] {
  const byKit = new Map<string, string[]>();
  const ungrouped: string[] = [];

  for (const c of components) {
    if (c.sourceKit == null) {
      ungrouped.push(c.name);
    } else {
      const arr = byKit.get(c.sourceKit) ?? [];
      arr.push(c.name);
      byKit.set(c.sourceKit, arr);
    }
  }

  // Known kits first, in the requested order; then any stale-tagged kit ids not
  // in kitOrder, in stable (alphabetical) order.
  const seen = new Set(kitOrder);
  const extraKits = [...byKit.keys()].filter((k) => !seen.has(k)).sort();
  const orderedKits = [...kitOrder, ...extraKits];

  const groups: ComponentGroup[] = orderedKits.map((kit) => ({
    kit,
    components: (byKit.get(kit) ?? []).slice().sort((a, b) => a.localeCompare(b)),
  }));

  if (ungrouped.length > 0) {
    groups.push({ kit: null, components: ungrouped.slice().sort((a, b) => a.localeCompare(b)) });
  }

  return groups;
}
