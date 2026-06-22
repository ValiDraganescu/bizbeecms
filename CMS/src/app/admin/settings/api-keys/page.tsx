import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";
import { checkRoleFromHeaders, canManageApiKeys } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * This site's public MCP endpoint, derived from the incoming request host.
 * Sites stay on `bizbeecms-cms-<slug>.workers.dev` (USER DECISION: no custom
 * subdomains), so the plain request host IS the right origin — no router HMAC
 * dance needed here. Falls back to a placeholder if the host header is missing.
 * ponytail: the host header is enough; verifyForwardedHost only matters for
 * router-proxied custom domains, which this product doesn't use.
 */
async function mcpUrlFromRequest(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}/mcp` : "https://<your-site>.workers.dev/mcp";
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("apiKeys");
  return { title: t("title") };
}

/**
 * CMS API-key management page (cms-mcp Slice 4). Mint / list / revoke the bearer
 * keys for the remote MCP server. Admin-only — the page mirrors the API-layer
 * `requireApiKeyManager` gate via `checkRoleFromHeaders(canManageApiKeys)` so a
 * non-Admin sees a notice instead of the manager (the /api/keys layer is the real
 * enforcement; this is defense-in-depth for the UI). The editor fetches its own
 * data client-side — no D1 binding needed for the initial render.
 */
export default async function ApiKeysPage() {
  const t = await getTranslations("apiKeys");
  const decision = await checkRoleFromHeaders(canManageApiKeys);
  const mcpUrl = await mcpUrlFromRequest();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <SettingsNav />
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      {decision.allow ? (
        <ApiKeysManager mcpUrl={mcpUrl} />
      ) : (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {t("forbidden")}
        </p>
      )}
    </main>
  );
}
