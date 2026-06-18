/**
 * The unified adapter factory (binding-adapters subgoal) — the single place that
 * reads the Cloudflare `env` and hands back all three ports as one bundle:
 * `{ db, storage, ai }`. CMS code that needs more than one binding asks for
 * `getPorts()` once instead of three separate `getCloudflareContext()` reads.
 *
 * It is thin: it composes the existing 1:1 CF adapters (`cfDb` / `CfStorage` /
 * `CfAi`) over a SINGLE resolved context — no new behavior, no second env read,
 * no re-implementing the per-binding factories' wrapping/guards. ZERO behavior
 * change vs. calling `getDb()`/`getStorage()`/`getAi()` individually:
 *   - `db`      — `cfDb(env.DB)`, the exact drizzle construction.
 *   - `storage` — `CfStorage(env.MEDIA)`, throws if MEDIA is unbound (matches
 *                 `getStorage()`).
 *   - `ai`      — `CfAi(env.AI)` or `null` when the binding is absent (preserves
 *                 `getAi()`'s nullability so the chat route still answers 503).
 *
 * The individual `getDb`/`getStorage`/`getAi` stay as-is for single-binding
 * callers; this factory is the bundle for code that wants the seam whole.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cfDb, type Db } from "./db.ts";
import { CfStorage, type Storage } from "./storage.ts";
import { CfAi, type Ai } from "./ai.ts";

/** All three ports for one Site. `ai` is null when the AI binding is unbound. */
export interface Ports {
  db: Db;
  storage: Storage;
  ai: Ai | null;
}

/** Build the port bundle from already-resolved bindings (the testable seam). */
export function cfPorts(env: {
  DB: D1Database;
  MEDIA?: R2Bucket;
  AI?: { run(model: string, inputs: unknown, options?: unknown): Promise<unknown> };
}): Ports {
  if (!env.MEDIA) throw new Error("R2 bucket binding MEDIA is not configured");
  return {
    db: cfDb(env.DB),
    storage: new CfStorage(env.MEDIA),
    ai: env.AI ? new CfAi(env.AI) : null,
  };
}

/** Resolve all three ports from the Cloudflare context in a single env read. */
export async function getPorts(): Promise<Ports> {
  const { env } = await getCloudflareContext({ async: true });
  return cfPorts(env as unknown as Parameters<typeof cfPorts>[0]);
}
