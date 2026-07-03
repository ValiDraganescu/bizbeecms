/**
 * Stale-thread history compaction (ai-context-engineering).
 *
 * When the widget LOADS a saved thread whose last activity is older than 24h,
 * each historical tool RESULT is compacted to a one-line stub before it enters
 * the transcript that the next send's model history is built from. This kills
 * the "reopen an old thread and replay 30kB of get_page results forever" cost.
 *
 * HARD CONSTRAINT (user directive 2026-07-03): NEVER mutate a live/recent
 * thread's replayed history — mid-conversation mutation invalidates the
 * provider's prompt cache and costs MORE than it saves. Compaction is legal
 * ONLY at thread-load time, and only for threads whose updatedAt is >24h old.
 * A fresh thread is returned BY REFERENCE, byte-identical.
 *
 * What is (and isn't) compacted:
 * - Only assistant-turn `tools[].output` — that's what buildModelHistory
 *   replays as the role:"tool" content. `parts` (the on-screen tool cards) are
 *   left untouched, so the UI still shows the full stored result.
 * - Error cards (`ok: false`) keep their exact error shape — the model must
 *   still see WHY a call failed.
 * - Small outputs stay: a stub for a 30-byte `{ok:true}` saves nothing.
 *
 * PURE — no @/db/React/CF imports; runs under dep-free `node --test`.
 */

export const STALE_THREAD_MS = 24 * 60 * 60 * 1000;
/** Outputs at or under this serialized size aren't worth stubbing. */
const MIN_COMPACT_CHARS = 400;

type AnyMessage = {
  role: string;
  content: string;
  tools?: unknown[];
  [k: string]: unknown;
};

function outputSize(output: unknown): number {
  if (typeof output === "string") return output.length;
  try {
    return JSON.stringify(output ?? {}).length;
  } catch {
    return 0; // non-serializable never made it through storage anyway
  }
}

function stub(name: unknown, size: number): string {
  const label = typeof name === "string" && name !== "" ? name : "tool";
  const kb = (size / 1024).toFixed(1);
  return `[${label} result, ${kb}kB — elided from history (thread went stale); call the tool again if you need this data]`;
}

/**
 * Compact a stored thread's messages iff the thread is stale (>24h since
 * updatedAt). Fresh threads are returned unchanged BY REFERENCE. Stale
 * threads get a new array where each successful tool card's oversized
 * `output` is replaced with a one-line stub; everything else (parts, media,
 * content, error cards, small outputs) is preserved as-is.
 */
export function compactStaleThreadMessages<M extends AnyMessage>(
  messages: M[],
  updatedAt: number,
  now: number = Date.now(),
): M[] {
  if (!Number.isFinite(updatedAt) || now - updatedAt <= STALE_THREAD_MS) return messages;

  return messages.map((m) => {
    if (m.role !== "assistant" || !Array.isArray(m.tools) || m.tools.length === 0) return m;
    let changed = false;
    const tools = m.tools.map((raw) => {
      if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return raw;
      const t = raw as Record<string, unknown>;
      if (t.ok === false) return raw; // keep error shape intact
      const size = outputSize(t.output);
      if (size <= MIN_COMPACT_CHARS) return raw;
      changed = true;
      return { ...t, output: stub(t.name, size) };
    });
    return changed ? { ...m, tools } : m;
  });
}
