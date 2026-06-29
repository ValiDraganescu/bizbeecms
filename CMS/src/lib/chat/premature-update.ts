/**
 * Guard against the model's "parallel get + update" mistake.
 *
 * Grok-4.20 routinely emits get_component AND update_component for the SAME
 * component in ONE tool batch — so the update can't have the real tree yet and
 * ships an empty/placeholder `{}`. Since update_component REPLACES the artifact,
 * that would wipe the component. This pure helper finds the offending update call
 * ids so the chat route can SHORT-CIRCUIT them (answer with a directive error
 * instead of running them) and let the model retry next round with the tree it
 * just read.
 *
 * Pure + node-testable (no CF/D1). The system prompt asks for read-then-write
 * ordering too, but the model parallelizes anyway — this is the mechanical net.
 */
export function prematureUpdateIds(
  calls: { id: string; name: string; args: unknown }[],
): Set<string> {
  const reads = new Set<string>();
  for (const c of calls) {
    if (c.name === "get_component") {
      const n = (c.args as { name?: unknown } | null)?.name;
      if (typeof n === "string") reads.add(n);
    }
  }
  const bad = new Set<string>();
  if (reads.size === 0) return bad;
  for (const c of calls) {
    if (c.name === "update_component") {
      const n = (c.args as { name?: unknown } | null)?.name;
      if (typeof n === "string" && reads.has(n)) bad.add(c.id);
    }
  }
  return bad;
}
