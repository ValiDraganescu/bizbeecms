import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LocaleSwitcher } from "@/components/i18n/locale-switcher";
import { SignOutButton } from "@/components/auth/sign-out-button";
import type { Role, User } from "@/db/schema";
import { canUserInvite } from "@/lib/invite/authz";

const roleKey: Record<Role, string> = {
  SuperAdmin: "superAdmin",
  Admin: "admin",
  Manager: "manager",
  Editor: "editor",
};

/**
 * Persistent top navigation for every authenticated PM page. Rendered in the
 * `(app)` layout so Sites / Invite are always reachable, not just from the home
 * page. Invite only shows for users who may invite; the link targets re-enforce
 * authz server-side regardless.
 */
export async function AppNav({ user }: { user: User }) {
  const t = await getTranslations("home");
  const tApp = await getTranslations("app");
  const tRoles = await getTranslations("roles");

  return (
    <header className="border-b border-border bg-surface-muted">
      <nav className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-2 px-6 py-3">
        <Link
          href="/"
          className="text-sm font-semibold text-foreground outline-none hover:text-primary focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {tApp("name")}
        </Link>

        <div className="flex items-center gap-1">
          <NavLink href="/sites" label={t("manageSites")} />
          {canUserInvite(user) ? (
            <NavLink href="/invite" label={t("inviteUsers")} />
          ) : null}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden truncate text-sm text-foreground-muted sm:inline">
            {user.email}
          </span>
          <Badge tone="primary">{tRoles(roleKey[user.role])}</Badge>
          <LocaleSwitcher />
          <ThemeToggle />
          <SignOutButton />
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex h-8 items-center rounded-md px-3 text-sm font-medium text-foreground outline-none hover:bg-surface-raised focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </Link>
  );
}
