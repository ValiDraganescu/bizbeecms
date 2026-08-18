/**
 * The OAuth issuer / public origin for THIS deployment: `APP_ORIGIN` when set
 * (production custom domain), else the incoming request's host (local dev).
 */
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { chooseIssuer } from "./core";

export async function issuerFromRequest(request: Request): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const appOrigin = (env as unknown as Record<string, unknown>).APP_ORIGIN;
  const h = request.headers;
  return chooseIssuer(
    typeof appOrigin === "string" ? appOrigin : undefined,
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto") ?? new URL(request.url).protocol.replace(":", ""),
  );
}

/** Same, from a Next `headers()` bag (server components / pages). */
export async function issuerFromHeaders(h: { get(name: string): string | null }): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const appOrigin = (env as unknown as Record<string, unknown>).APP_ORIGIN;
  return chooseIssuer(
    typeof appOrigin === "string" ? appOrigin : undefined,
    h.get("x-forwarded-host") ?? h.get("host"),
    h.get("x-forwarded-proto") ?? "https",
  );
}
