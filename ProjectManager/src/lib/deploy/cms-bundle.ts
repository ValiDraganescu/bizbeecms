/**
 * CMS bundle loader — turns the committed, pre-built CMS Worker artifact into the
 * `{ mainModule, files }` shape `deploySite` expects.
 *
 * The artifact (`cms-bundle.generated.js`) is produced at build time by
 * `scripts/build-cms-bundle.mjs`: it esbuild-bundles the OpenNext output of the
 * `CMS/` app (`CMS/.open-next/worker.js` + ~980 chunk modules) into ONE
 * self-contained ESM module string. We commit it because the deployed PM runs on
 * Cloudflare Workers and cannot run a build to produce it on demand.
 *
 * Regenerate after any CMS change:  (cd ProjectManager && node scripts/build-cms-bundle.mjs --opennext)
 */

import type { WorkerScriptUpload } from "./script-upload";

/** The bundle input the deploy engine consumes. */
export type CmsBundle = Pick<WorkerScriptUpload, "mainModule" | "files">;

/**
 * Load the committed CMS Worker bundle.
 *
 * Returns `null` if the artifact has not been generated yet (a fresh checkout
 * before `build-cms-bundle.mjs` has run), so callers can surface a clear
 * "CMS bundle not built" state instead of importing a missing module.
 */
export async function buildCmsBundle(): Promise<CmsBundle | null> {
  try {
    // Dynamic import so a missing/ungenerated artifact degrades gracefully
    // rather than failing the whole module graph at load time.
    const mod = (await import("./cms-bundle.generated.js")) as {
      mainModule: string;
      files: Record<string, string>;
      builtAt?: string;
    };

    if (
      !mod?.mainModule ||
      !mod.files ||
      typeof mod.files[mod.mainModule] !== "string" ||
      mod.files[mod.mainModule].length === 0
    ) {
      return null;
    }

    return { mainModule: mod.mainModule, files: mod.files };
  } catch {
    return null;
  }
}

/** When the artifact was generated (ISO 8601), or null if not built. */
export async function cmsBundleBuiltAt(): Promise<string | null> {
  try {
    const mod = (await import("./cms-bundle.generated.js")) as {
      builtAt?: string;
    };
    return mod.builtAt ?? null;
  } catch {
    return null;
  }
}
