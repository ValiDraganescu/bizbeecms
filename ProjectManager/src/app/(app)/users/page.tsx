import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { SidebarSections, type SidebarSection } from "@/components/sidebar-sections";
import type { Role } from "@/db/schema";
import {
  getCurrentUser,
  getUserCountries,
  getUserTagIds,
  listUsersWithScope,
} from "@/lib/auth/user";
import { canUserInvite } from "@/lib/invite/authz";
import {
  getInviteCountriesMap,
  getInviteTagsMap,
  listPendingInvites,
} from "@/lib/invite/invite";
import { listTags } from "@/lib/tags/tags";
import { InviteForm } from "./invite-form";
import { PendingInvites, type PendingInvite } from "./pending-invites";
import { UsersManager } from "./users-manager";

const roleKey: Record<Role, string> = {
  SuperAdmin: "superAdmin",
  Admin: "admin",
  Manager: "manager",
  Editor: "editor",
};

/**
 * User management hub (users + invitations merged — the old /invite page
 * redirects here). Admin+ only — Manager/Editor are redirected away and the
 * /api/users + /api/invites routes re-enforce. The invite cards additionally
 * require canUserInvite (SuperAdmin, or an Admin with the invite grant).
 */
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const t = await getTranslations("users");
  const tInv = await getTranslations("invites");
  const tRoles = await getTranslations("roles");
  const actor = (await getCurrentUser())!;
  if (actor.role !== "SuperAdmin" && actor.role !== "Admin") redirect("/");
  const { section } = await searchParams;

  const allowedToInvite = canUserInvite(actor);

  const [users, tags, actorCountries, actorTagIds] = await Promise.all([
    listUsersWithScope(),
    listTags(),
    getUserCountries(actor.id),
    getUserTagIds(actor.id),
  ]);

  // Invite data (only loaded when the actor may invite).
  const pending = allowedToInvite ? await listPendingInvites() : [];
  const inviteIds = pending.map((i) => i.id);
  const countriesByInvite = await getInviteCountriesMap(inviteIds);
  const tagsByInvite = await getInviteTagsMap(inviteIds);
  const tagLabel = (id: string) =>
    tags.find((tg) => tg.id === id)?.label ?? id;

  // Pre-resolve invite rows to plain strings so the client table stays thin.
  const pendingRows: PendingInvite[] = pending.map((inv) => {
    const countries = countriesByInvite.get(inv.id) ?? [];
    return {
      id: inv.id,
      email: inv.email,
      roleLabel: tRoles(roleKey[inv.role]),
      countryText:
        countries.length > 0 ? countries.join(", ") : tInv("pending.global"),
      tagLabels: (tagsByInvite.get(inv.id) ?? []).map(tagLabel),
      expires: inv.expiresAt.toISOString().slice(0, 10),
    };
  });

  const sections: SidebarSection[] = [
    {
      id: "users",
      label: t("list.title"),
      wide: true,
      content: (
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
      ),
    },
  ];

  if (allowedToInvite) {
    sections.push(
      {
        id: "invite",
        label: tInv("form.title"),
        content: (
          <Card>
            <CardHeader>
              <CardTitle>{tInv("form.title")}</CardTitle>
              <CardDescription>{tInv("form.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <InviteForm
                inviter={{
                  role: actor.role,
                  countries: actorCountries,
                  tagIds: actorTagIds,
                }}
                managedTags={tags.map((tg) => ({
                  id: tg.id,
                  label: tg.label,
                }))}
              />
            </CardContent>
          </Card>
        ),
      },
      {
        id: "pending",
        label: tInv("pending.title"),
        wide: true,
        content: (
          <Card>
            <CardHeader>
              <CardTitle>{tInv("pending.title")}</CardTitle>
              <CardDescription>{tInv("pending.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <PendingInvites invites={pendingRows} />
            </CardContent>
          </Card>
        ),
      },
    );
  }

  return (
    <main className="flex flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </header>

      <SidebarSections
        allLabel={t("sections.all")}
        initialId={section}
        sections={sections}
      />
    </main>
  );
}
