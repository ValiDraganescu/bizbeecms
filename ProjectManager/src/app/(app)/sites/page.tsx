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
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canUserCreateSite } from "@/lib/site/authz";
import { listSitesForUser, primaryDomainBySite } from "@/lib/site/site";
import { cmsWorkerUrl } from "@/lib/deploy/worker-url";
import { displayCmsVersion } from "@/lib/deploy/cms-version";
import { isUpdateAvailable } from "@/lib/deploy/cms-releases";
import { fetchCmsReleases } from "@/lib/deploy/cms-releases-server";
import { SiteForm } from "./site-form";
import { DeployStatusBadge } from "./deploy-status-badge";

/**
 * Sites list + create. The list is scoped server-side to what the user may see
 * (SuperAdmin/global → all; scoped Admin → their countries; Editor → their
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

  // Slice 6: fetch the release list ONCE (no N+1) so we can flag sites running
  // an older CMS than the latest tag. Empty/unreachable → no badges anywhere.
  const releases = await fetchCmsReleases();
  const latestVersion = releases[0]?.version ?? null;

  // Public CMS URL per deployed Site, for the Open link. A custom domain (CF-for-
  // SaaS) is preferred over the raw workers.dev URL; batch-load them (no N+1).
  const customDomains = await primaryDomainBySite(
    sites.filter((s) => s.status === "deployed").map((s) => s.id),
  );
  const urls = new Map<string, string>();
  for (const site of sites) {
    if (site.status === "deployed" && site.workerName) {
      const domain = customDomains.get(site.id);
      const url = domain
        ? `https://${domain}`
        : cmsWorkerUrl(site.workerName);
      if (url) urls.set(site.id, url);
    }
  }

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
                  <TableHead>{t("list.cmsVersion")}</TableHead>
                  <TableHead className="text-right">{t("list.open")}</TableHead>
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
                      <DeployStatusBadge
                        siteId={site.id}
                        initialStatus={site.status}
                      />
                    </TableCell>
                    <TableCell>
                      {displayCmsVersion(site.deployedCmsVersion) ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="font-mono text-xs tabular-nums">
                            {displayCmsVersion(site.deployedCmsVersion)}
                          </span>
                          {isUpdateAvailable(site.deployedCmsVersion, latestVersion) ? (
                            <Badge tone="warning" dot title={t("list.cmsUpdateAvailable")}>
                              {t("list.cmsUpdateAvailable")}
                            </Badge>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-xs text-foreground-muted">
                          {t("list.cmsVersionNone")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {urls.get(site.id) ? (
                        <a
                          href={urls.get(site.id)}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 rounded-md text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {t("list.open")}
                          <svg
                            width="13"
                            height="13"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <path d="M15 3h6v6" />
                            <path d="M10 14 21 3" />
                          </svg>
                        </a>
                      ) : (
                        <span className="text-foreground-muted">—</span>
                      )}
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
