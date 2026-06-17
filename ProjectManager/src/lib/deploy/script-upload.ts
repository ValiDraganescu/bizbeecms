/**
 * Pure builder for the Cloudflare Workers "Script Upload" multipart body.
 *
 * Split from cloudflare.ts (which reads secrets from the Worker env) so the
 * credential-free, deterministic core of the deploy request can be imported and
 * unit-tested with `node --test` — no `@opennextjs/cloudflare`, no fetch, no
 * Cloudflare auth required.
 */

/**
 * A single ES-module Worker script to upload. `mainModule` is the entry file
 * name; `files` maps every module file name to its source text. This mirrors
 * the OpenNext bundle: one `worker.js` entry plus any chunk files.
 */
export type WorkerScriptUpload = {
  scriptName: string;
  mainModule: string;
  files: Record<string, string>;
  compatibilityDate?: string;
  compatibilityFlags?: string[];
};

/** Default compat date matching both apps' wrangler.jsonc. */
export const DEFAULT_COMPAT_DATE = "2025-03-25";
/** Default compat flags matching both apps' wrangler.jsonc. */
export const DEFAULT_COMPAT_FLAGS = [
  "nodejs_compat",
  "global_fetch_strictly_public",
];

/**
 * Build the multipart/form-data body for the Workers Script Upload API.
 *
 * The API expects a `metadata` part (JSON describing main_module + settings)
 * plus one part per module file (content-type application/javascript+module).
 */
export function buildScriptUploadForm(upload: WorkerScriptUpload): FormData {
  const form = new FormData();

  const metadata = {
    main_module: upload.mainModule,
    compatibility_date: upload.compatibilityDate ?? DEFAULT_COMPAT_DATE,
    compatibility_flags: upload.compatibilityFlags ?? DEFAULT_COMPAT_FLAGS,
  };
  form.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );

  for (const [name, source] of Object.entries(upload.files)) {
    form.append(
      name,
      new Blob([source], { type: "application/javascript+module" }),
      name,
    );
  }

  return form;
}
