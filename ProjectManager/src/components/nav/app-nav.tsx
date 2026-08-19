import { getTranslations } from "next-intl/server";
import type { Role, User } from "@/db/schema";
import { canUserCreateSite } from "@/lib/site/authz";
import { AppDock, type DockItem } from "./app-dock";

const roleKey: Record<Role, string> = {
  SuperAdmin: "superAdmin",
  Admin: "admin",
  Manager: "manager",
  Editor: "editor",
};

/**
 * Server side of the app navigation: resolves the role-gated destination list
 * and labels, then renders the floating dock / bottom tab bar (AppDock). Link
 * targets re-enforce authz server-side regardless of what shows here.
 */
export async function AppNav({ user }: { user: User }) {
  const tNav = await getTranslations("app.nav");
  const tUsers = await getTranslations("users");
  const tTags = await getTranslations("tags");
  const tSettings = await getTranslations("settings");
  const tRoles = await getTranslations("roles");

  // Admin+ may manage the global user list + settings.
  const isAdminPlus = user.role === "SuperAdmin" || user.role === "Admin";

  const items: DockItem[] = [
    { id: "sites", href: "/sites", label: tNav("sites") },
    ...(isAdminPlus
      ? [{ id: "users", href: "/users", label: tUsers("navLink") } as const]
      : []),
    ...(isAdminPlus
      ? [
          {
            id: "settings",
            href: "/settings",
            label: tSettings("navLink"),
          } as const,
        ]
      : []),
    ...(canUserCreateSite(user)
      ? [{ id: "tags", href: "/tags", label: tTags("navLink") } as const]
      : []),
  ];

  return (
    <AppDock
      items={items}
      email={user.email}
      roleLabel={tRoles(roleKey[user.role])}
    />
  );
}
