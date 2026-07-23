import Link from "next/link";
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
import { getCreditPoolUsd, getCuratedPurposes } from "@/lib/ai/settings";
import { AiModelsForm } from "./ai-models-form";

/**
 * AI model curation — the operator picks, per purpose, the aliases every Site's
 * CMS may use (label + OpenRouter model + margin), plus the global monthly
 * credit pool. Admin+ only (same gate as the rest of /settings); the API
 * re-enforces. See docs/ai-cost-quotas.md.
 */
export default async function AiModelsSettingsPage() {
  const t = await getTranslations("settings.aiModels");
  const actor = (await getCurrentUser())!;
  if (actor.role !== "SuperAdmin" && actor.role !== "Admin") redirect("/");

  const [purposes, poolUsd] = await Promise.all([
    getCuratedPurposes(),
    getCreditPoolUsd(),
  ]);

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
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
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <AiModelsForm initialPurposes={purposes} initialPoolUsd={poolUsd} />
        </CardContent>
      </Card>
    </main>
  );
}
