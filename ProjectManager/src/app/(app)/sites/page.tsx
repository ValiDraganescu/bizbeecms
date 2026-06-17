import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  Alert,
  AlertBody,
  AlertTitle,
  Badge,
  type BadgeTone,
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
import type { SiteStatus } from "@/db/schema";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canUserCreateSite } from "@/lib/site/authz";
import { listSitesForUser } from "@/lib/site/site";
import { createSiteAction } from "./actions";
import { SiteForm } from "./site-form";

const statusTone: Record<SiteStatus, BadgeTone> = {
  draft: "neutral",
  deploying: "primary",
  deployed: "success",
  failed: "danger",
};

/**
 * Sites list + create. The list is scoped server-side to what the user may see
 * (SuperAdmin/global → all; scoped Admin → their countries; SiteManager → their
 * assignments). The create card only shows for users who may create Sites; the
 * action re-enforces authz regardless.
 */
export default async function SitesPage() {
  const t = await getTranslations("sites");
  // Guaranteed by the (app) layout, but the type is User | null.
  const user = (await getCurrentUser())!;
  const canCreate = canUserCreateSite(user);
  const actorCountries = canCreate ? await getUserCountries(user.id) : [];
  const sites = await listSitesForUser(user);

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

      {canCreate ? (
        <Card>
          <CardHeader>
            <CardTitle>{t("form.createTitle")}</CardTitle>
            <CardDescription>{t("form.createDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SiteForm
              action={createSiteAction}
              actor={{ role: user.role, countries: actorCountries }}
              mode="create"
            />
          </CardContent>
        </Card>
      ) : (
        <Alert tone="info">
          <AlertTitle>{t("notAllowedTitle")}</AlertTitle>
          <AlertBody>{t("notAllowedBody")}</AlertBody>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t("list.title")}</CardTitle>
          <CardDescription>{t("list.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          {sites.length === 0 ? (
            <p className="text-sm text-foreground-muted">
              {canCreate ? t("list.empty") : t("list.emptyAssigned")}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("list.name")}</TableHead>
                  <TableHead>{t("list.slug")}</TableHead>
                  <TableHead>{t("list.country")}</TableHead>
                  <TableHead>{t("list.status")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sites.map((site) => (
                  <TableRow key={site.id}>
                    <TableCell>
                      <Link
                        href={`/sites/${site.id}`}
                        className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {site.name}
                      </Link>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground-muted">
                      {site.slug}
                    </TableCell>
                    <TableCell>
                      {site.country ?? t("list.global")}
                    </TableCell>
                    <TableCell>
                      <Badge tone={statusTone[site.status]}>
                        {t(`status.${site.status}`)}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
