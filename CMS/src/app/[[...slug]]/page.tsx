/**
 * Public page route (Milestone 2, epic A2 — productionizes the /test proof).
 *
 * A catch-all that loads a published page from the per-Site D1, walks its block
 * tree against the component library, SSRs each component's `tree` via
 * React.createElement (a DATA WALK — never eval/Function, banned on Workers),
 * and ships each used component's client `script` as a <script> the BROWSER
 * runs. This route is a THIN caller — slug → page → plan resolution lives in
 * `lib/render/load-plan.ts` (page walk in `resolve-page.ts`, shared with the
 * edge-cache worker entrypoint `CMS/worker.ts`);
 * the pure walker is `lib/render/tree.ts`, slug matching `lib/render/slug.ts`.
 */
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { type LocaleContext, parseJsonColumn } from "@/lib/render/tree";
import { resolveLocalized } from "@/lib/render/localize";
import { RenderedPage } from "@/lib/render/render-page";
import { loadPlan, type RouteParams } from "@/lib/render/load-plan";
import { hreflangAlternates } from "@/lib/render/hreflang";
import { resolveSiteOrigin } from "@/lib/render/site-origin";

/** Resolve a per-locale JSON map (e.g. metaTitle) to the active locale w/ fallback. */
function localized(raw: string, locale: LocaleContext): string | undefined {
  const map = parseJsonColumn<unknown>(raw, {});
  const resolved = resolveLocalized(map, locale.locale, locale.fallback);
  return typeof resolved === "string" && resolved !== "" ? resolved : undefined;
}

/** Next's searchParams promise is `?key=value|value[]|undefined` — flatten to
 * the first value per key (the query-param feature only needs single values,
 * mirroring RouteContext.query). */
function flattenSearchParams(
  raw: Record<string, string | string[] | undefined>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "string") out[k] = v;
    else if (Array.isArray(v) && typeof v[0] === "string") out[k] = v[0];
  }
  return out;
}

type SearchParams = Record<string, string | string[] | undefined>;

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}): Promise<Metadata> {
  const { slug } = await params;
  const loaded = await loadPlan({ slug }, flattenSearchParams(await searchParams));
  if (!loaded) return {};
  const title = localized(loaded.page.metaTitle, loaded.locale);
  const description = localized(loaded.page.metaDescription, loaded.locale);
  const image = localized(loaded.page.metaImage, loaded.locale);
  // SEO (Stage 1): canonical + hreflang alternates across the configured
  // content locales — same slug chain, default unprefixed, others /<code>/….
  // metadataBase (APP_ORIGIN) absolutizes them; without a known origin Next
  // falls back to the request-derived default, fine for local dev.
  const codes = loaded.locale.available?.map((l) => l.code) ?? [loaded.locale.fallback];
  const { canonical, languages } = hreflangAlternates(slug, codes, loaded.locale.fallback);
  const origin = await resolveSiteOrigin();
  return {
    title,
    description,
    metadataBase: origin ? new URL(origin) : undefined,
    alternates: {
      canonical,
      languages: Object.keys(languages).length > 0 ? languages : undefined,
    },
    // OpenGraph image, resolved per active locale (falls back like title/desc).
    openGraph: image ? { images: [{ url: image }] } : undefined,
  };
}

export default async function PublicPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<SearchParams>;
}) {
  const loaded = await loadPlan(await params, flattenSearchParams(await searchParams));
  if (!loaded) notFound();
  // Identical render to the admin draft-preview route — see lib/render/render-page.
  return <RenderedPage plan={loaded.plan} />;
}
