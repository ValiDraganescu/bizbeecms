import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/user";
import { getGlobalBuildTimeoutMin } from "@/lib/deploy/settings";
import {
  MAX_BUILD_TIMEOUT_MIN,
  MIN_BUILD_TIMEOUT_MIN,
} from "@/lib/deploy/build-timeout";
import { getCreditPoolUsd, getCuratedPurposes } from "@/lib/ai/settings";
import { issuerFromHeaders } from "@/lib/oauth/issuer";
import { AiModelsForm } from "./ai-models/ai-models-form";
import { ApplyCapsButton } from "./ai-models/apply-caps-button";
import { FleetUsageTable } from "./ai-usage/fleet-usage-table";
import { BuildTimeoutForm } from "./build-timeout-form";
import { ConnectionsManager } from "./connections/connections-manager";
import { SidebarSections } from "@/components/sidebar-sections";

/**
 * Global settings — operator-tunable, account-wide knobs. Admin+ only (same gate
 * as /users); Manager/Editor are redirected and the API re-enforces. Sidebar
 * model: section labels left, one section's content right (drill-in list on
 * mobile). Every section's content lives inline; the old sub-pages redirect
 * here with ?section=.
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const t = await getTranslations("settings");
  const tAi = await getTranslations("settings.aiModels");
  const tUsage = await getTranslations("settings.aiUsage");
  const tKeys = await getTranslations("settings.connections");
  const actor = (await getCurrentUser())!;
  if (actor.role !== "SuperAdmin" && actor.role !== "Admin") redirect("/");

  const [buildTimeoutMin, purposes, poolUsd, { section }] = await Promise.all([
    getGlobalBuildTimeoutMin(),
    getCuratedPurposes(),
    getCreditPoolUsd(),
    searchParams,
  ]);
  const mcpUrl = `${await issuerFromHeaders(await headers())}/mcp`;

  const sections = [
    {
      id: "buildTimeout",
      label: t("buildTimeout.title"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("buildTimeout.title")}</CardTitle>
            <CardDescription>{t("buildTimeout.description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <BuildTimeoutForm
              initial={buildTimeoutMin}
              min={MIN_BUILD_TIMEOUT_MIN}
              max={MAX_BUILD_TIMEOUT_MIN}
            />
          </CardContent>
        </Card>
      ),
    },
    {
      id: "aiModels",
      label: tAi("title"),
      wide: true,
      content: (
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <CardTitle>{tAi("title")}</CardTitle>
              <CardDescription>{tAi("description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <AiModelsForm
                initialPurposes={purposes}
                initialPoolUsd={poolUsd}
              />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>{tAi("applyCaps.title")}</CardTitle>
              <CardDescription>{tAi("applyCaps.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ApplyCapsButton />
            </CardContent>
          </Card>
        </div>
      ),
    },
    {
      id: "aiUsage",
      label: tUsage("title"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{tUsage("title")}</CardTitle>
            <CardDescription>{tUsage("description")}</CardDescription>
          </CardHeader>
          <CardContent>
            <FleetUsageTable />
          </CardContent>
        </Card>
      ),
    },
    {
      id: "connections",
      label: tKeys("title"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{tKeys("title")}</CardTitle>
            <CardDescription>{tKeys("cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <ConnectionsManager mcpUrl={mcpUrl} />
          </CardContent>
        </Card>
      ),
    },
  ];

  return (
    <main className="flex flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
      </header>

      <SidebarSections
        sections={sections}
        allLabel={t("sections.all")}
        initialId={section}
      />
    </main>
  );
}
