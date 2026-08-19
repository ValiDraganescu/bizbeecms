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
import { SidebarSections } from "@/components/sidebar-sections";
import { getCurrentUser } from "@/lib/auth/user";
import { canUserCreateSite } from "@/lib/site/authz";
import { listTags } from "@/lib/tags/tags";
import { TagsManager } from "./tags-manager";

/**
 * Manage the org tag vocabulary (pm-roles Slice 3b). Admin+ only (same tier as
 * Site create). Editors/Managers are redirected away — the API re-enforces.
 */
export default async function TagsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const t = await getTranslations("tags");
  const user = (await getCurrentUser())!;
  if (!canUserCreateSite(user)) redirect("/");

  const [tags, { section }] = await Promise.all([listTags(), searchParams]);

  return (
    <main className="flex flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </header>

      <SidebarSections
        allLabel={t("sections.all")}
        initialId={section}
        sections={[
          {
            id: "list",
            label: t("list.title"),
            content: (
              <div className="flex flex-col gap-6">
                <Alert tone="info">
                  <AlertTitle>{t("info.title")}</AlertTitle>
                  <AlertBody>{t("info.body")}</AlertBody>
                </Alert>
                <Card>
                <CardHeader>
                  <CardTitle>{t("list.title")}</CardTitle>
                  <CardDescription>{t("list.description")}</CardDescription>
                </CardHeader>
                <CardContent>
                  <TagsManager
                    initialTags={tags.map((tg) => ({
                      id: tg.id,
                      label: tg.label,
                    }))}
                  />
                  </CardContent>
                </Card>
              </div>
            ),
          },
        ]}
      />
    </main>
  );
}
