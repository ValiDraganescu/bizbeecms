import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  Badge,
  type BadgeTone,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import type { CountryCode } from "@/lib/auth/countries";
import type { SiteStatus } from "@/db/schema";
import { findUserById, getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canManageSiteByCountry } from "@/lib/site/authz";
import { cmsWorkerUrl } from "@/lib/deploy/worker-url";
import {
  findSiteById,
  getSiteUserIds,
  isUserAssignedToSite,
  listAssignableUsers,
  listSiteDomains,
} from "@/lib/site/site";
import { AssignForm } from "../assign-form";
import { DeployForm } from "../deploy-form";
import { DeployTimeline } from "../deploy-timeline";
import { CustomDomainForm } from "../custom-domain-form";
import { isDeployStuck } from "@/lib/deploy";
import { SiteForm } from "../site-form";

const statusTone: Record<SiteStatus, BadgeTone> = {
  draft: "neutral",
  deploying: "primary",
  deployed: "success",
  failed: "danger",
};

/**
 * Site detail. Access is gated server-side: a user reaches a Site either by
 * country (SuperAdmin/global → all; scoped Admin → their countries) OR by
 * assignment (site_users). Users who can manage the Site (country reach) also
 * get the edit form and the user-assignment panel; assigned-only viewers
 * (e.g. SiteManagers) see the read-only overview.
 */
export default async function SiteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("sites");

  const user = (await getCurrentUser())!;
  const site = await findSiteById(id);
  if (!site) notFound();

  const actorCountries = await getUserCountries(user.id);
  const canManage = canManageSiteByCountry(user, actorCountries, site);
  const assigned = await isUserAssignedToSite(user.id, site.id);
  // Not reachable by country and not assigned → no access.
  if (!canManage && !assigned) notFound();

  const creator = await findUserById(site.createdBy);
  const domains = await listSiteDomains(site.id);

  // Public URL of the deployed CMS Worker (derived from APP_ORIGIN), if deployed.
  const workerUrl =
    site.status === "deployed" && site.workerName
      ? await cmsWorkerUrl(site.workerName)
      : null;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-1">
        <Link
          href="/sites"
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
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{site.name}</h1>
          <Badge tone={statusTone[site.status]}>
            {t(`status.${site.status}`)}
          </Badge>
        </div>
        <p className="font-mono text-sm text-foreground-muted">{site.slug}</p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>{t("detail.overview")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
            <Detail label={t("detail.country")}>
              {site.country ?? t("detail.global")}
            </Detail>
            <Detail label={t("detail.workerName")}>
              {site.workerName ?? (
                <span className="text-foreground-muted">
                  {t("detail.workerNamePending")}
                </span>
              )}
            </Detail>
            <Detail label={t("detail.url")}>
              {workerUrl ? (
                <a
                  href={workerUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-sm text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  {workerUrl}
                </a>
              ) : (
                <span className="text-foreground-muted">
                  {t("detail.workerNamePending")}
                </span>
              )}
            </Detail>
            <Detail label={t("detail.createdBy")}>
              {creator?.email ?? "—"}
            </Detail>
            <Detail label={t("detail.createdAt")}>
              <span className="tabular-nums">
                {site.createdAt.toISOString().slice(0, 10)}
              </span>
            </Detail>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("deploy.title")}</CardTitle>
          <CardDescription>{t("deploy.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DeployForm
            siteId={site.id}
            status={site.status}
            stuck={isDeployStuck(site)}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("timeline.title")}</CardTitle>
          <CardDescription>{t("timeline.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <DeployTimeline siteId={site.id} initialStatus={site.status} />
        </CardContent>
      </Card>

      {canManage ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t("customDomain.title")}</CardTitle>
              <CardDescription>{t("customDomain.cardDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <CustomDomainForm
                siteId={site.id}
                deployed={site.status === "deployed"}
                domains={domains.map((d) => d.hostname)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("form.editTitle")}</CardTitle>
              <CardDescription>{t("form.editDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <SiteForm
                siteId={site.id}
                actor={{ role: user.role, countries: actorCountries }}
                mode="edit"
                initial={{
                  name: site.name,
                  slug: site.slug,
                  country: (site.country as CountryCode | null) ?? null,
                }}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t("assign.title")}</CardTitle>
              <CardDescription>{t("assign.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <AssignForm
                siteId={site.id}
                assignable={await listAssignableUsers(
                  site.country as CountryCode | null,
                )}
                assigned={await getSiteUserIds(site.id)}
              />
            </CardContent>
          </Card>
        </>
      ) : null}
    </main>
  );
}

function Detail({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
        {label}
      </dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}
