import type { Metadata } from "next";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { ConnectionsManager } from "@/components/settings/connections-manager";
import { issuerFromHeaders } from "@/lib/oauth/issuer";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("connections");
  return { title: t("title") };
}

/**
 * MCP connections (cms-mcp → OAuth; replaces the API-keys page): the signed-in
 * user's ACTIVE OAuth grants for this Site + how to connect Claude Code. Every
 * CMS user manages their OWN grants — a grant acts as its owner (their role
 * bounds what the tools may do), so no extra role gate. The MCP URL uses the
 * same origin rule as the OAuth issuer (deployer `APP_ORIGIN`, else request host).
 */
export default async function ConnectionsPage() {
  const t = await getTranslations("connections");
  const mcpUrl = `${await issuerFromHeaders(await headers())}/mcp`;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <ConnectionsManager mcpUrl={mcpUrl} />
    </main>
  );
}
