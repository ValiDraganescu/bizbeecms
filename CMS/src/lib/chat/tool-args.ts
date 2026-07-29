/**
 * The ONE result/record contract for pure tool arg validators. Every
 * `*-tools.ts` validator shapes untrusted model args into `ArgResult` and
 * starts by narrowing them with `asRecord` — this module is the canonical
 * definition (previously cloned per-module). Dep-free (no `@/`, no CF) so it
 * loads under `node --test` via relative `.ts` imports, like its consumers.
 */

/** Result of validating a tool's args: a clean payload, or an error message. */
export type ArgResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Narrow untrusted args to a plain object (arrays rejected), else null. */
export function asRecord(args: unknown): Record<string, unknown> | null {
  return typeof args === "object" && args !== null && !Array.isArray(args)
    ? (args as Record<string, unknown>)
    : null;
}
