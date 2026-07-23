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
import { FleetUsageTable } from "./fleet-usage-table";

/**
 * Fleet AI usage (Contract F). Admin+ only — same gate as the rest of
 * /settings, re-enforced by /api/settings/ai-usage.
 *
 * The page shell renders instantly and the table polls the fleet from the
 * browser: the poll fans out to every Site's Worker plus OpenRouter, so doing it
 * during SSR would stall the whole page behind the slowest unreachable site.
 */
export default async function AiUsagePage() {
  const t = await getTranslations("settings.aiUsage");
  const actor = (await getCurrentUser())!;
  if (actor.role !== "SuperAdmin" && actor.role !== "Admin") redirect("/");

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-6 py-10">
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
          <FleetUsageTable />
        </CardContent>
      </Card>
    </main>
  );
}
