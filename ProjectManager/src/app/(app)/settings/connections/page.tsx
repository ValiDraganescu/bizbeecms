import Link from "next/link";
import { headers } from "next/headers";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui";
import { issuerFromHeaders } from "@/lib/oauth/issuer";
import { ConnectionsManager } from "./connections-manager";

/**
 * MCP connections (pm-mcp Slice 2): the user's active OAuth grants + how to
 * connect Claude Code. Every signed-in user manages their OWN grants — a grant
 * acts as its owner, so no extra role gate.
 */
export default async function ConnectionsPage() {
  const t = await getTranslations("settings.connections");
  const mcpUrl = `${await issuerFromHeaders(await headers())}/mcp`;

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href="/settings"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("back")}
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-foreground-muted">{t("subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("listTitle")}</CardTitle>
          <CardDescription>{t("listDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <ConnectionsManager mcpUrl={mcpUrl} />
        </CardContent>
      </Card>
    </main>
  );
}
