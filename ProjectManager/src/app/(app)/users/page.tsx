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
import {
  getCurrentUser,
  getUserCountries,
  getUserTagIds,
  listUsersWithScope,
} from "@/lib/auth/user";
import { listTags } from "@/lib/tags/tags";
import { UsersManager } from "./users-manager";

/**
 * Global user-management page (pm-roles Slice 5). Admin+ only — Manager/Editor
 * are redirected away and the /api/users routes re-enforce. Renders the users
 * table with inline role + country/tag editing and an in-app remove modal. The
 * server passes the actor's own role + scope so the client can pre-hide actions
 * the API would 403 (the API stays the real gate).
 */
export default async function UsersPage() {
  const t = await getTranslations("users");
  const actor = (await getCurrentUser())!;
  if (actor.role !== "SuperAdmin" && actor.role !== "Admin") redirect("/");

  const [users, tags, actorCountries, actorTagIds] = await Promise.all([
    listUsersWithScope(),
    listTags(),
    getUserCountries(actor.id),
    getUserTagIds(actor.id),
  ]);

  return (
    <main className="mx-auto flex max-w-4xl flex-col gap-6 px-6 py-10">
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
          <UsersManager
            actor={{
              id: actor.id,
              role: actor.role,
              countries: actorCountries,
              tagIds: actorTagIds,
            }}
            initialUsers={users.map((u) => ({
              id: u.id,
              email: u.email,
              role: u.role,
              countries: u.countries,
              tagIds: u.tagIds,
            }))}
            tags={tags.map((tg) => ({ id: tg.id, label: tg.label }))}
          />
        </CardContent>
      </Card>
    </main>
  );
}
