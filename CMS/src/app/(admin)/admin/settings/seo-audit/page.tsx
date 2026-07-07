import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { listPagesForAudit } from "@/db/page-store";
import { getContentLocales } from "@/db/settings-store";
import { auditSeo, type SeoAuditReport } from "@/lib/render/seo-audit";
import { defaultContentLocales } from "@/lib/render/localize";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("seoAudit");
  return { title: t("title") };
}

const EMPTY: SeoAuditReport = {
  orphans: [],
  brokenLinks: [],
  missingMeta: [],
  missingAlt: [],
};

/**
 * Read-only SEO audit report (seo-robots goal — operator SEO tooling). Runs the
 * pure `auditSeo` analyzer over the published-page rows and renders four finding
 * lists. No auto-fix — each finding names a page + a locale for the operator to
 * fix in that page's settings. Explicit `/admin/settings/seo-audit` route wins
 * over the public `[[...slug]]` catch-all.
 */
export default async function SeoAuditPage() {
  const t = await getTranslations("seoAudit");

  let report = EMPTY;
  try {
    const [pages, locales] = await Promise.all([
      listPagesForAudit(),
      getContentLocales().catch(() => defaultContentLocales()),
    ]);
    report = auditSeo(pages, locales);
  } catch {
    /* unbound D1 offline — render an empty (all-clear) report */
  }

  const total =
    report.orphans.length +
    report.brokenLinks.length +
    report.missingMeta.length +
    report.missingAlt.length;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>

      {total === 0 ? (
        <p className="rounded-lg border border-border bg-primary-subtle px-4 py-3 text-sm text-foreground">
          {t("allClear")}
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          <Section
            title={t("orphans.title")}
            description={t("orphans.description")}
            empty={t("orphans.empty")}
            count={report.orphans.length}
            rows={report.orphans.map((o) => ({
              key: o.pageId,
              page: `/${o.slug}`,
              detail: o.path,
            }))}
            pageLabel={t("columnPage")}
            detailLabel={t("columnDetail")}
          />

          <Section
            title={t("brokenLinks.title")}
            description={t("brokenLinks.description")}
            empty={t("brokenLinks.empty")}
            count={report.brokenLinks.length}
            rows={report.brokenLinks.map((b, i) => ({
              key: `${b.pageId}-${b.href}-${i}`,
              page: `/${b.slug}`,
              detail: b.href,
            }))}
            pageLabel={t("columnPage")}
            detailLabel={t("columnDetail")}
          />

          <Section
            title={t("missingMeta.title")}
            description={t("missingMeta.description")}
            empty={t("missingMeta.empty")}
            count={report.missingMeta.length}
            rows={report.missingMeta.map((m, i) => ({
              key: `${m.pageId}-${m.locale}-${i}`,
              page: `/${m.slug}`,
              detail:
                `${m.locale}: ` +
                m.missing
                  .map((f) =>
                    f === "title" ? t("missingMeta.missingTitle") : t("missingMeta.missingDescription"),
                  )
                  .join(", "),
            }))}
            pageLabel={t("columnPage")}
            detailLabel={t("columnDetail")}
          />

          <Section
            title={t("missingAlt.title")}
            description={t("missingAlt.description")}
            empty={t("missingAlt.empty")}
            count={report.missingAlt.length}
            rows={report.missingAlt.map((a, i) => ({
              key: `${a.pageId}-${i}`,
              page: `/${a.slug}`,
              detail: a.src || t("missingAlt.noSrc"),
            }))}
            pageLabel={t("columnPage")}
            detailLabel={t("columnDetail")}
          />
        </div>
      )}
    </main>
  );
}

function Section({
  title,
  description,
  empty,
  count,
  rows,
  pageLabel,
  detailLabel,
}: {
  title: string;
  description: string;
  empty: string;
  count: number;
  rows: Array<{ key: string; page: string; detail: string }>;
  pageLabel: string;
  detailLabel: string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline gap-2">
        <h2 className="text-lg font-medium text-foreground">{title}</h2>
        {count > 0 && (
          <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-medium text-foreground-muted">
            {count}
          </span>
        )}
      </div>
      <p className="text-sm text-foreground-muted">{description}</p>
      {count === 0 ? (
        <p className="text-sm text-foreground-muted">✓ {empty}</p>
      ) : (
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-foreground-muted">
              <th className="py-2 pr-4 font-medium">{pageLabel}</th>
              <th className="py-2 font-medium">{detailLabel}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-border/50">
                <td className="py-2 pr-4 font-mono text-foreground">{r.page}</td>
                <td className="py-2 font-mono text-foreground-muted">{r.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
