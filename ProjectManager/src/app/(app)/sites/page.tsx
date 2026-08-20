import { getTranslations } from "next-intl/server";
import {
  Alert,
  AlertBody,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { getCurrentUser, getUserCountries } from "@/lib/auth/user";
import { canUserCreateSite } from "@/lib/site/authz";
import { listSitesForUser, primaryDomainBySite } from "@/lib/site/site";
import { listTags } from "@/lib/tags/tags";
import { cmsWorkerUrl } from "@/lib/deploy/worker-url";
import { fetchCmsReleases } from "@/lib/deploy/cms-releases-server";
import { SidebarSections } from "@/components/sidebar-sections";
import { SiteForm } from "./site-form";
import { SitesTable, type SiteRow } from "./sites-table";

/**
 * Sites list + create. The list is scoped server-side to what the user may see
 * (SuperAdmin/global → all; scoped Admin → their countries; Editor → their
 * assignments). The create card only shows for users who may create Sites; the
 * action re-enforces authz regardless.
 */
export default async function SitesPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const t = await getTranslations("sites");
  const { section } = await searchParams;
  // Guaranteed by the (app) layout, but the type is User | null.
  const user = (await getCurrentUser())!;
  const canCreate = canUserCreateSite(user);
  const actorCountries = canCreate ? await getUserCountries(user.id) : [];
  const tags = canCreate ? await listTags() : [];
  const sites = await listSitesForUser(user);

  // Slice 6: fetch the release list ONCE (no N+1) — it flags outdated sites
  // AND feeds the per-row/fleet version pickers (fleet-deploy). Empty →
  // no badges, no pickers.
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

  const createCard = canCreate ? (
    <Card>
      <CardHeader>
        <CardTitle>{t("form.createTitle")}</CardTitle>
        <CardDescription>{t("form.createDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <SiteForm
          actor={{ role: user.role, countries: actorCountries }}
          tags={tags.map((tag) => ({ id: tag.id, label: tag.label }))}
        />
      </CardContent>
    </Card>
  ) : (
    <Alert tone="info">
      <AlertTitle>{t("notAllowedTitle")}</AlertTitle>
      <AlertBody>{t("notAllowedBody")}</AlertBody>
    </Alert>
  );

  // Serializable rows for the client table (fleet-deploy): plain data only —
  // the client owns selection/rollout state, the server stays the data source.
  const rows: SiteRow[] = sites.map((site) => ({
    id: site.id,
    name: site.name,
    slug: site.slug,
    country: site.country,
    status: site.status,
    deployedCmsVersion: site.deployedCmsVersion,
    url: urls.get(site.id) ?? null,
  }));

  const listCard = (
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
          <SitesTable
            sites={rows}
            releases={releases}
            latestVersion={latestVersion}
          />
        )}
      </CardContent>
    </Card>
  );


  return (
    <main className="flex flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </header>

      <SidebarSections
        allLabel={t("sections.all")}
        initialId={section}
        sections={[
          { id: "list", label: t("list.title"), wide: true, content: listCard },
          { id: "create", label: t("form.createTitle"), content: createCard },
        ]}
      />
    </main>
  );
}
