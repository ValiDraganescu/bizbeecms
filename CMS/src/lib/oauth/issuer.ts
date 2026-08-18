/**
 * The OAuth issuer / public origin for THIS Site's CMS Worker: the
 * deployer-injected `APP_ORIGIN` when set (the site's configured public origin —
 * its custom domain when attached, else the workers.dev URL), else the incoming
 * request's host (local dev). Same rule the API-key page used for the MCP URL.
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { chooseIssuer } from "./core";

async function appOrigin(): Promise<string | undefined> {
  const { env } = await getCloudflareContext({ async: true });
  const v = (env as unknown as Record<string, unknown>).APP_ORIGIN;
  return typeof v === "string" ? v : undefined;
}

export async function issuerFromRequest(request: Request): Promise<string> {
  const h = request.headers;
  return chooseIssuer(
    await appOrigin(),
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", ""),
  );
}

/** Same, from a Next `headers()` bag (server components / pages). */
export async function issuerFromHeaders(h: { get(name: string): string | null }): Promise<string> {
  return chooseIssuer(
    await appOrigin(),
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto") ?? "https",
  );
}
