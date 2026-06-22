/**
 * Pure core of the CMS AI tool dispatch (cms-mcp Slice 1).
 *
 * The chat route and the (upcoming) MCP server must run the SAME validated tool
 * handlers — one code path, no fork of the safety gates (see cms-mcp CAVEATS).
 * The real handlers are CF-coupled (D1/R2 store writes), so they live in
 * `tool-dispatch.ts` which imports `@/db/*`. THIS file holds only the pieces with
 * no CF imports so they're unit-testable with the project's dep-free `node --test`
 * convention (no `@/` alias resolves there).
 *
 * What's pure here:
 *   - the handler/result contract types,
 *   - `makeDispatcher(handlers)` — turn a name→handler map into a dispatcher that
 *     returns a structured `{name, ...}` result, mapping an unknown tool or a
 *     thrown handler to `{ok:false, errors}` (a bad call never throws — one tool
 *     must not kill the chat stream or the MCP request),
 *   - `selectToolSchemas(byName, names)` — resolve a list of tool names to their
 *     schema objects from the shared registry (so the MCP server enumerates the
 *     SAME registry the chat route uses; a tool added there is exposed for free).
 *
 * ponytail: no registry abstraction beyond a plain map — there's one registry.
 */

/** A tool handler: takes the (untrusted) args, returns the result payload sans `name`. */
export type ToolHandler = (args: unknown) => Promise<Record<string, unknown>>;

/** The structured result of running one tool. Always carries the tool `name`. */
export type DispatchResult = { name: string } & Record<string, unknown>;

/**
 * Build a dispatcher over a name→handler map. The returned function runs the
 * matching handler and tags the result with `name`; an unknown tool or a thrown
 * handler becomes `{name, ok:false, errors:[…]}`. Never throws.
 */
export function makeDispatcher(
  handlers: Record<string, ToolHandler>,
): (name: string, args: unknown) => Promise<DispatchResult> {
  return async (name, args) => {
    const handler = handlers[name];
    if (!handler) {
      return { name, ok: false, errors: [`unknown tool: ${name}`] };
    }
    try {
      return { name, ...(await handler(args)) };
    } catch (err) {
      return { name, ok: false, errors: [(err as Error).message] };
    }
  };
}

/**
 * Resolve tool names to their schema objects from the shared registry, skipping
 * any name with no schema (defensive — keeps a stray name from yielding
 * `undefined` in the list). Order follows `names`.
 */
export function selectToolSchemas<T>(
  byName: Record<string, T>,
  names: readonly string[],
): T[] {
  const out: T[] = [];
  for (const n of names) {
    const schema = byName[n];
    if (schema !== undefined) out.push(schema);
  }
  return out;
}
