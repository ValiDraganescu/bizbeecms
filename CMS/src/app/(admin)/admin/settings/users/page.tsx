import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { UsersManager } from "@/components/settings/users-manager";
import { checkRoleFromHeaders, canManageUsers } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("users");
  return { title: t("title") };
}

/**
 * CMS user-management page (cms-auth Slice 5). List users + pending invites,
 * invite by email + role, change a user's role, remove a user, revoke an invite.
 * Manager+ only — `checkRoleFromHeaders(canManageUsers)` mirrors the API-layer
 * `requireUserManager` gate so a non-manager sees a notice instead of the manager
 * (the /api/users + /api/invite layers are the real enforcement; this is
 * defense-in-depth for the UI). The manager fetches its own data client-side.
 */
export default async function UsersPage() {
  const t = await getTranslations("users");
  const decision = await checkRoleFromHeaders(canManageUsers);

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      {decision.allow ? (
        <UsersManager />
      ) : (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {t("forbidden")}
        </p>
      )}
    </main>
  );
}
