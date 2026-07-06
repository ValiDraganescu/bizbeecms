/**
 * `Images` port — the ONLY place that reads the `env.IMAGES` Cloudflare Images
 * binding (peer of `storage.ts`/`env.MEDIA`). Used by the `/media/<key>` serve
 * route for transform-on-delivery (PNG/JPEG → WebP).
 *
 * Unlike `getStorage()` this returns null instead of throwing when unbound:
 * a missing transformer means "serve the original bytes", never a 5xx —
 * delivery must degrade gracefully (old deployer configs, local dev gaps).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";

export async function getImages(): Promise<ImagesBinding | null> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { IMAGES?: ImagesBinding }).IMAGES ?? null;
  } catch {
    return null;
  }
}
