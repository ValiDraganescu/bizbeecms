import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Alert,
  AlertBody,
  AlertTitle,
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import type { Role } from "@/db/schema";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canUserInvite } from "@/lib/invite/authz";
import { listPendingInvites, getInviteCountriesMap } from "@/lib/invite/invite";
import { InviteForm } from "./invite-form";

const roleKey: Record<Role, string> = {
  SuperAdmin: "superAdmin",
  Admin: "admin",
  SiteManager: "siteManager",
};

/**
 * Invite management. Only SuperAdmin (any country) and `canInvite` Admins
 * (scoped to their country) may invite — the layout already gated auth, and the
 * action re-enforces authz server-side. Non-eligible users see a notice.
 */
export default async function InvitePage() {
  const t = await getTranslations("invites");
  const tRoles = await getTranslations("roles");
  // Guaranteed by the (app) layout, but the type is User | null.
  const user = (await getCurrentUser())!;
  const allowed = canUserInvite(user);

  const inviterCountries = allowed ? await getUserCountries(user.id) : [];
  const pending = allowed ? await listPendingInvites() : [];
  const countriesByInvite = await getInviteCountriesMap(pending.map((i) => i.id));

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
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

      {!allowed ? (
        <Alert tone="info">
          <AlertTitle>{t("notAllowedTitle")}</AlertTitle>
          <AlertBody>{t("notAllowedBody")}</AlertBody>
        </Alert>
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("form.title")}</CardTitle>
              <CardDescription>{t("form.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <InviteForm
                inviter={{ role: user.role, countries: inviterCountries }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("pending.title")}</CardTitle>
              <CardDescription>{t("pending.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              {pending.length === 0 ? (
                <p className="text-sm text-foreground-muted">
                  {t("pending.empty")}
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t("pending.email")}</TableHead>
                      <TableHead>{t("pending.role")}</TableHead>
                      <TableHead>{t("pending.country")}</TableHead>
                      <TableHead>{t("pending.expires")}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pending.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell>{inv.email}</TableCell>
                        <TableCell>
                          <Badge tone="neutral">
                            {tRoles(roleKey[inv.role])}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {(countriesByInvite.get(inv.id) ?? []).length > 0
                            ? countriesByInvite.get(inv.id)!.join(", ")
                            : t("pending.global")}
                        </TableCell>
                        <TableCell className="tabular-nums text-foreground-muted">
                          {inv.expiresAt.toISOString().slice(0, 10)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
