/**
 * Pure search filter for the page-builder Components rail (page-builder epic).
 *
 * The rail renders kit groups (from `GET /api/components/grouped`) and a search
 * box. Typing filters component names across all groups, case-insensitively; a
 * group with no matching components is dropped entirely so the rail only shows
 * groups that still have content. Empty/whitespace query → groups unchanged.
 *
 * Pure data shaping (no D1, no fetch, no React) so it's trivially testable.
 */
import type { ComponentGroup } from "./grouped";

export function filterGroups(groups: ComponentGroup[], query: string): ComponentGroup[] {
  const q = query.trim().toLowerCase();
  if (!q) return groups;
  return groups
    .map((g) => ({
      ...g,
      components: g.components.filter((name) => name.toLowerCase().includes(q)),
    }))
    .filter((g) => g.components.length > 0);
}
