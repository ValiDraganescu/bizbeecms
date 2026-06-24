/**
 * content-collections (Phase-2): shaping raw-SELECT console results for the UI.
 *
 * PURE (no I/O). The operator SQL console returns arbitrary SELECT rows; the UI
 * needs a stable column list to render a table. SQLite returns every selected
 * column on every row, but stay robust to sparse/empty result sets: take the
 * UNION of keys in first-seen order so the header matches what the operator
 * SELECTed (first row leads the order).
 */

/** Ordered union of keys across rows (first-seen order). `[]` for no rows. */
export function columnsOf(rows: Record<string, unknown>[]): string[] {
  const columns: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key);
        columns.push(key);
      }
    }
  }
  return columns;
}
