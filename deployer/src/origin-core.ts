// Pure, dependency-free helpers split out of index.ts so they're loadable by
// `node --test` (which can't resolve the Worker-only `@cloudflare/sandbox`
// import in index.ts). Mirrors the CMS `*-core.ts` convention.

// Conservative hostname shape (same as the deployer's HOSTNAME_RE for custom
// domains): label-dotted, lowercase, no scheme/path.
const HOST_RE =
  /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/**
 * Pick the CMS Worker's public origin (APP_ORIGIN). Prefer the site's primary
 * custom domain (passed by PM as `appOrigin`, an https URL) when it's a valid
 * https URL with a well-formed hostname; otherwise fall back to the workers.dev
 * URL. APP_ORIGIN feeds the MCP URL the CMS advertises AND trusted invite/reset
 * links, so we never accept a junk/non-https value off the wire.
 */
export function chooseAppOrigin(
  fromBody: string | undefined | null,
  workersDevOrigin: string,
): string {
  if (typeof fromBody === "string") {
    const raw = fromBody.trim().replace(/\/+$/, "");
    const m = /^https:\/\/([^/]+)$/.exec(raw);
    if (m && HOST_RE.test(m[1].toLowerCase())) return raw;
  }
  return workersDevOrigin;
}
