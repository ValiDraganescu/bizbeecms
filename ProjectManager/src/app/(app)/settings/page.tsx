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
import { getGlobalBuildTimeoutMin } from "@/lib/deploy/settings";
import {
  MAX_BUILD_TIMEOUT_MIN,
  MIN_BUILD_TIMEOUT_MIN,
} from "@/lib/deploy/build-timeout";
import { BuildTimeoutForm } from "./build-timeout-form";

/**
 * Global settings — operator-tunable, account-wide knobs. Admin+ only (same gate
 * as /users); Manager/Editor are redirected and the API re-enforces. The global
 * build timeout (deploy anti-stall) lives here inline; bigger settings get their
 * own sub-page (AI model curation), linked from a card.
 */
export default async function SettingsPage() {
  const t = await getTranslations("settings");
  const tAi = await getTranslations("settings.aiModels");
  const tUsage = await getTranslations("settings.aiUsage");
  const actor = (await getCurrentUser())!;
  if (actor.role !== "SuperAdmin" && actor.role !== "Admin") redirect("/");

  const buildTimeoutMin = await getGlobalBuildTimeoutMin();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("back")}
        </Link>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="text-sm text-foreground-muted">{t("subtitle")}</p>
      </header>

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

      <Card>
        <CardHeader>
          <CardTitle>{tAi("title")}</CardTitle>
          <CardDescription>{tAi("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/ai-models"
            className="inline-flex h-10 items-center rounded-md border border-border bg-surface-muted px-4 text-sm font-medium text-foreground outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tAi("open")}
          </Link>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tUsage("title")}</CardTitle>
          <CardDescription>{tUsage("description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link
            href="/settings/ai-usage"
            className="inline-flex h-10 items-center rounded-md border border-border bg-surface-muted px-4 text-sm font-medium text-foreground outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
          >
            {tUsage("open")}
          </Link>
        </CardContent>
      </Card>
    </main>
  );
}
