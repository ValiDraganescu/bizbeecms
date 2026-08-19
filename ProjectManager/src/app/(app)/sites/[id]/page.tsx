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
import { canManageSiteByCountry, canUserCreateSite } from "@/lib/site/authz";
import { cmsWorkerUrl } from "@/lib/deploy/worker-url";
import { displayCmsVersion } from "@/lib/deploy/cms-version";
import {
  findSiteById,
  getSiteTagIds,
  getSiteUserIds,
  isUserAssignedToSite,
  listAssignableUsers,
  listSiteDomains,
  listSitesForUser,
} from "@/lib/site/site";
import { SidebarSections, type SidebarSection } from "@/components/sidebar-sections";
import { SiteSwitcher } from "@/components/site-switcher";
import { listTags } from "@/lib/tags/tags";
import { DeployForm } from "../deploy-form";
import { DeployTimeline } from "../deploy-timeline";
import { CustomDomainForm } from "../custom-domain-form";
import { DeleteSiteForm } from "../delete-site-form";
import { isDeployStuck } from "@/lib/deploy";
import { getGlobalBuildTimeoutMin } from "@/lib/deploy/settings";
import { GeneralForm, LimitsForm, ScopingForm } from "../edit-site-cards";

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
 * (e.g. Editors) see the read-only overview.
 */
export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const { id } = await params;
  const { section } = await searchParams;
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
  // Sibling Sites for the master-detail sidebar (same scoping as /sites).
  const siblingSites = await listSitesForUser(user);
  const domains = await listSiteDomains(site.id);
  // Shown as the default in the per-Site build-timeout override field.
  const globalBuildTimeoutMin = await getGlobalBuildTimeoutMin();

  // Public URL of the deployed CMS Worker, if deployed. Prefer a custom domain
  // that SERVES the Site (CF-for-SaaS) over the raw workers.dev URL — but never a
  // redirect-only host (e.g. an apex that 301s to www), since that's not where the
  // Site is served. listSiteDomains is newest-first; take the first serving one.
  const servingDomain = domains.find((d) => !d.redirectTo);
  const workerUrl =
    site.status === "deployed" && site.workerName
      ? servingDomain
        ? `https://${servingDomain.hostname}`
        : cmsWorkerUrl(site.workerName)
      : null;

  // Scoping data (manage-only sections).
  const [siteTagIds, assignableUsers, assignedUserIds, allTags] = canManage
    ? await Promise.all([
        getSiteTagIds(site.id),
        listAssignableUsers(site.country as CountryCode | null),
        getSiteUserIds(site.id),
        canUserCreateSite(user) ? listTags() : Promise.resolve([]),
      ])
    : [[], [], [], []];

  const current = {
    name: site.name,
    slug: site.slug,
    country: (site.country as CountryCode | null) ?? null,
    monthlyLimitUsd: site.openrouterMonthlyLimitUsd,
    buildTimeoutMin: site.buildTimeoutMin,
  };

  const sections: SidebarSection[] = [
    {
      id: "overview",
      label: t("detail.overview"),
      wide: true,
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("detail.overview")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
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
                    className="font-mono text-sm break-all text-primary hover:text-primary-hover"
                  >
                    {workerUrl}
                  </a>
                ) : (
                  <span className="text-foreground-muted">
                    {t("detail.workerNamePending")}
                  </span>
                )}
              </Detail>
              <Detail label={t("detail.cmsVersion")}>
                {displayCmsVersion(site.deployedCmsVersion) ? (
                  <span className="font-mono tabular-nums">
                    {displayCmsVersion(site.deployedCmsVersion)}
                  </span>
                ) : (
                  <span className="text-foreground-muted">
                    {t("detail.cmsVersionNone")}
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
      ),
    },
  ];

  if (canManage) {
    sections.push(
      {
        id: "general",
        label: t("form.generalTitle"),
        content: (
          <Card>
            <CardHeader>
              <CardTitle>{t("form.generalTitle")}</CardTitle>
              <CardDescription>{t("form.generalDescription")}</CardDescription>
            </CardHeader>
            <CardContent>
              <GeneralForm siteId={site.id} current={current} />
            </CardContent>
          </Card>
        ),
      },
      {
        id: "scoping",
        label: t("scoping.title"),
        content: (
          <Card>
            <CardHeader>
              <CardTitle>{t("scoping.title")}</CardTitle>
              <CardDescription>{t("scoping.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <ScopingForm
                siteId={site.id}
                actor={{ role: user.role, countries: actorCountries }}
                current={current}
                tags={allTags.map((tag) => ({ id: tag.id, label: tag.label }))}
                assignedTagIds={siteTagIds}
                assignableUsers={assignableUsers}
                assignedUserIds={assignedUserIds}
              />
            </CardContent>
          </Card>
        ),
      },
      {
        id: "limits",
        label: t("limits.title"),
        content: (
          <Card>
            <CardHeader>
              <CardTitle>{t("limits.title")}</CardTitle>
              <CardDescription>{t("limits.description")}</CardDescription>
            </CardHeader>
            <CardContent>
              <LimitsForm
                siteId={site.id}
                current={current}
                hasMintedOpenrouterKey={site.openrouterKeyHash != null}
                globalBuildTimeoutMin={globalBuildTimeoutMin}
              />
            </CardContent>
          </Card>
        ),
      },
    );
  }

  // Deployment: the deploy action and its timeline are one concern.
  sections.push({
    id: "deploy",
    label: t("deploy.title"),
    wide: true,
    content: (
      <Card>
        <CardHeader>
          <CardTitle>{t("deploy.title")}</CardTitle>
          <CardDescription>{t("deploy.cardDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <DeployForm
            siteId={site.id}
            status={site.status}
            stuck={isDeployStuck(site)}
          />
          <div className="border-t border-border pt-4">
            <DeployTimeline siteId={site.id} initialStatus={site.status} />
          </div>
        </CardContent>
      </Card>
    ),
  });

  if (canManage) {
    sections.push({
      id: "domain",
      label: t("customDomain.title"),
      content: (
        <Card>
          <CardHeader>
            <CardTitle>{t("customDomain.title")}</CardTitle>
            <CardDescription>{t("customDomain.cardDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            <CustomDomainForm
              siteId={site.id}
              deployed={site.status === "deployed"}
              domains={domains.map((d) => ({
                hostname: d.hostname,
                redirectTo: d.redirectTo,
              }))}
            />
          </CardContent>
        </Card>
      ),
    });
  }

  if (canManage && canUserCreateSite(user)) {
    sections.push({
      id: "danger",
      label: t("dangerZone.title"),
      wide: true,
      content: (
        <Card className="border-danger/40">
          <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-4">
            <div className="flex min-w-0 flex-1 basis-80 flex-col gap-1">
              <CardTitle className="text-danger">
                {t("dangerZone.title")}
              </CardTitle>
              <CardDescription>
                {t("dangerZone.cardDescription")}
              </CardDescription>
            </div>
            <DeleteSiteForm
              siteId={site.id}
              slug={site.slug}
              siteName={site.name}
            />
          </div>
        </Card>
      ),
    });
  }

  return (
    <main className="flex flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <SiteSwitcher
              sites={siblingSites.map((s) => ({ id: s.id, name: s.name }))}
              currentId={site.id}
              listLabel={t("title")}
            />
            <Badge tone={statusTone[site.status]}>
              {t(`status.${site.status}`)}
            </Badge>
          </div>
          <p className="font-mono text-sm text-foreground-muted">{site.slug}</p>
        </div>
        {workerUrl ? (
          <div className="flex flex-wrap gap-2">
            <a
              href={workerUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium bg-surface-muted text-foreground border border-border hover:bg-surface-raised outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("detail.openSite")}
            </a>
            <a
              href={`${workerUrl}/admin`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground hover:bg-primary-hover outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t("detail.openAdmin")}
            </a>
          </div>
        ) : null}
      </header>

      <SidebarSections
        allLabel={t("sections.all")}
        initialId={section}
        sections={sections}
      />
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
