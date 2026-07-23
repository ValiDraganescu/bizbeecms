import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * The PM↔CMS machine-to-machine gate. Every deployed CMS Worker carries the
 * PM-wide `CMS_AUTH_SECRET` and presents it as `Authorization: Bearer <secret>`
 * on service-to-service calls (auth bridge, SSO exchange, AI config).
 *
 * One helper so the three (and counting) service routes share one gate instead
 * of each re-implementing the header parse. Fail-closed: a missing/blank secret
 * in the environment rejects everything.
 */
export async function hasValidCmsSecret(request: Request): Promise<boolean> {
  const { env } = await getCloudflareContext({ async: true });
  const secret = (env as unknown as Record<string, unknown>).CMS_AUTH_SECRET;
  const presented = (request.headers.get("authorization") ?? "").replace(
    /^Bearer\s+/i,
    "",
  );
  return typeof secret === "string" && secret !== "" && presented === secret;
}
