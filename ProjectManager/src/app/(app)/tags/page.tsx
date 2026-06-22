import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Alert,
  AlertBody,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/user";
import { canUserCreateSite } from "@/lib/site/authz";
import { listTags } from "@/lib/tags/tags";
import { TagsManager } from "./tags-manager";

/**
 * Manage the org tag vocabulary (pm-roles Slice 3b). Admin+ only (same tier as
 * Site create). Editors/Managers are redirected away — the API re-enforces.
 */
export default async function TagsPage() {
  const t = await getTranslations("tags");
  const user = (await getCurrentUser())!;
  if (!canUserCreateSite(user)) redirect("/");

  const tags = await listTags();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href="/"
          className="inline-flex w-fit items-center gap-1.5 rounded-md text-sm font-medium text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {t("back")}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-foreground-muted">{t("subtitle")}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
          <CardDescription>{t("list.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert tone="info" className="mb-4">
            <AlertTitle>{t("info.title")}</AlertTitle>
            <AlertBody>{t("info.body")}</AlertBody>
          </Alert>
          <TagsManager initialTags={tags.map((tg) => ({ id: tg.id, label: tg.label }))} />
        </CardContent>
      </Card>
    </main>
  );
}
