import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SettingsNav } from "@/components/settings/settings-nav";
import { ApiKeysManager } from "@/components/settings/api-keys-manager";
import { checkRoleFromHeaders, canManageApiKeys } from "@/lib/auth/guard";
import { chooseMcpUrl } from "@/app/mcp/mcp-core";

export const dynamic = "force-dynamic";

/**
 * This site's public MCP endpoint. Prefer the deployer-injected `APP_ORIGIN`
 * (the site's CONFIGURED public origin — its custom domain when attached, else
 * the workers.dev URL); only fall back to the request host in local dev when
 * APP_ORIGIN is unset (BUG fix, USER 2026-06-24: admin is often browsed on
 * workers.dev while the site serves a custom domain, so the request host was
 * advertising the wrong URL).
 */
async function mcpUrl(): Promise<string> {
  const { env } = await getCloudflareContext({ async: true });
  const appOrigin = (env as unknown as { APP_ORIGIN?: string }).APP_ORIGIN;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return chooseMcpUrl(appOrigin, host, proto);
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
  const url = await mcpUrl();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <SettingsNav />
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      {decision.allow ? (
        <ApiKeysManager mcpUrl={url} />
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
