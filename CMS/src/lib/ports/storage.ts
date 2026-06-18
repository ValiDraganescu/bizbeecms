/**
 * `Storage` port — the ports-and-adapters seam for blob storage (binding-adapters
 * subgoal). CMS code depends on this small interface instead of touching the
 * Cloudflare `env.MEDIA` R2 binding directly.
 *
 * In scope: the interface + a single Cloudflare adapter (`CfStorage`) that wraps
 * today's R2 binding 1:1 — ZERO behavior change. NOT in scope: a second
 * (Vercel/Blob) adapter — main is "fully Cloudflare-native". We build the socket,
 * not the second plug.
 *
 * The interface intentionally exposes ONLY the three R2 methods `asset-store.ts`
 * actually calls (`put` / `get` / `delete`) — keep the port minimal (see CAVEATS).
 *
 * This module is the ONLY place that reads `env.MEDIA`. Everything else takes a
 * `Storage` (via `getStorage()`), which makes the storage-coupled logic
 * unit-testable by passing an in-memory fake (see `scripts/storage-port.test.mjs`).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Blob storage as the CMS uses it. A 1:1 subset of the R2 binding surface —
 * `put` / `get` / `delete` — preserving the exact native R2 return shapes so the
 * adapter is a pass-through and callers behave identically.
 */
export interface Storage {
  put(
    key: string,
    bytes: ArrayBuffer,
    options?: { contentType?: string },
  ): Promise<void>;
  get(key: string): Promise<R2ObjectBody | null>;
  delete(key: string): Promise<void>;
}

/**
 * Cloudflare R2 adapter — wraps an `R2Bucket` (the `env.MEDIA` binding) as a
 * `Storage`. The only translation is `{ contentType }` → R2's `httpMetadata`,
 * exactly as `asset-store.putAsset` did before.
 */
export class CfStorage implements Storage {
  private readonly bucket: R2Bucket;
  constructor(bucket: R2Bucket) {
    this.bucket = bucket;
  }

  async put(
    key: string,
    bytes: ArrayBuffer,
    options?: { contentType?: string },
  ): Promise<void> {
    await this.bucket.put(key, bytes, {
      httpMetadata: { contentType: options?.contentType },
    });
  }

  get(key: string): Promise<R2ObjectBody | null> {
    return this.bucket.get(key);
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }
}

/**
 * The adapter factory: resolve the live `Storage` from the Cloudflare context.
 * The single reader of `env.MEDIA` in the app. Throws if the binding is absent,
 * matching the previous `getBucket()` behavior.
 */
export async function getStorage(): Promise<Storage> {
  const { env } = await getCloudflareContext({ async: true });
  const bucket = (env as unknown as { MEDIA?: R2Bucket }).MEDIA;
  if (!bucket) throw new Error("R2 bucket binding MEDIA is not configured");
  return new CfStorage(bucket);
}
