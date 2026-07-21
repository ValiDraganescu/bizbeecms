/**
 * The unified adapter factory (binding-adapters subgoal) — the single place that
 * reads the Cloudflare `env` and hands back the binding-backed ports as one
 * bundle: `{ db, storage }`. CMS code that needs more than one binding asks for
 * `getPorts()` once instead of separate `getCloudflareContext()` reads.
 *
 * It is thin: it composes the existing 1:1 CF adapters (`cfDb` / `CfStorage`)
 * over a SINGLE resolved context — no new behavior, no second env read, no
 * re-implementing the per-binding factories' wrapping/guards. ZERO behavior
 * change vs. calling `getDb()`/`getStorage()` individually:
 *   - `db`      — `cfDb(env.DB)`, the exact drizzle construction.
 *   - `storage` — `CfStorage(env.MEDIA)`, throws if MEDIA is unbound (matches
 *                 `getStorage()`).
 *
 * The AI port is NOT in the bundle: OpenRouter is key-based (no CF binding) and
 * its factory (`getAi()`) is async over D1 — callers use `getAi()` directly.
 *
 * The individual `getDb`/`getStorage` stay as-is for single-binding callers;
 * this factory is the bundle for code that wants the seam whole.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { cfDb, type Db } from "./db.ts";
import { CfStorage, type Storage } from "./storage.ts";

/** The binding-backed ports for one Site. */
export interface Ports {
  db: Db;
  storage: Storage;
}

/** Build the port bundle from already-resolved bindings (the testable seam). */
export function cfPorts(env: { DB: D1Database; MEDIA?: R2Bucket }): Ports {
  if (!env.MEDIA) throw new Error("R2 bucket binding MEDIA is not configured");
  return {
    db: cfDb(env.DB),
    storage: new CfStorage(env.MEDIA),
  };
}

/** Resolve the ports from the Cloudflare context in a single env read. */
export async function getPorts(): Promise<Ports> {
  const { env } = await getCloudflareContext({ async: true });
  return cfPorts(env as unknown as Parameters<typeof cfPorts>[0]);
}
