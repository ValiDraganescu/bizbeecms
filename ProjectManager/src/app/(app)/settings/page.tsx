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
 * as /users); Manager/Editor are redirected and the API re-enforces. Currently
 * just the global build timeout (deploy anti-stall); the page is the home for
 * future global settings.
 */
export default async function SettingsPage() {
  const t = await getTranslations("settings");
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
    </main>
  );
}
