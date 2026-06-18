import type { Metadata } from "next";
import Link from "next/link";
import { listPages } from "@/db/page-store";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sitemap (dev)" };

/**
 * Dev sitemap — a flat tree of every route in the CMS, public AND admin, so you
 * can see the whole surface from one place during development. NOT an SEO
 * sitemap.xml (that's a separate slice) and NOT gated by anything beyond the
 * /admin layout guard. Route lists are hand-maintained (the app dir is fixed and
 * known at build time — a filesystem crawler would be overkill); the published
 * pages section is the one live D1 read.
 *
 * ponytail: hard-coded route lists, no i18n (labels are literal paths, a dev
 * aid). When you add a route, add a line here.
 */

// Static routes, grouped. href present = navigable in the browser; api routes
// are listed for reference (you can't click a POST endpoint).
const PUBLIC_ROUTES: { path: string; href?: string; note?: string }[] = [
  { path: "/[[...slug]]", href: "/", note: "published pages (root needs a 'home' slug, else 404)" },
  { path: "/media/[...key]", note: "serves an R2 asset by key" },
];

const ADMIN_PAGES: { path: string; href: string }[] = [
  { path: "/admin", href: "/admin" },
  { path: "/admin/sitemap", href: "/admin/sitemap" },
  { path: "/admin/chat", href: "/admin/chat" },
  { path: "/admin/pages", href: "/admin/pages" },
  { path: "/admin/components", href: "/admin/components" },
  { path: "/admin/media", href: "/admin/media" },
  { path: "/admin/settings/content-locales", href: "/admin/settings/content-locales" },
  { path: "/admin/settings/theme", href: "/admin/settings/theme" },
  { path: "/admin/settings/brand", href: "/admin/settings/brand" },
];

const ADMIN_API: { path: string; methods: string }[] = [
  { path: "/api/health", methods: "GET" },
  { path: "/api/chat", methods: "POST (SSE)" },
  { path: "/api/pages", methods: "GET · POST · PUT · DELETE" },
  { path: "/api/pages/[id]/blocks", methods: "GET · PUT" },
  { path: "/api/components", methods: "GET · POST (import)" },
  { path: "/api/components/kit", methods: "POST (install)" },
  { path: "/api/assets", methods: "GET · POST · DELETE" },
  { path: "/api/settings", methods: "GET · PUT (content-locales/theme/brand)" },
];

function Row({ children }: { children: React.ReactNode }) {
  return <li className="font-mono text-sm text-foreground-muted">{children}</li>;
}

export default async function DevSitemapPage() {
  // The only live data: published page tree. Safe-default to [] so the page
  // renders offline / when D1 is unreachable (CAVEATS admin-page pattern).
  let pages: Awaited<ReturnType<typeof listPages>> = [];
  let pagesError = false;
  try {
    pages = await listPages();
  } catch {
    pagesError = true;
  }

  // Build slug paths for nested pages (one level of nesting per the page model).
  const pathFor = (p: (typeof pages)[number]) =>
    "/" + (p.parentSlug ? `${p.parentSlug}/${p.slug}` : p.slug);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Sitemap (dev)</h1>
        <p className="mt-1 text-foreground-muted">
          Every route in this CMS — public and admin. Dev aid, not an SEO sitemap.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-foreground">Public</h2>
        <ul className="flex flex-col gap-1">
          {PUBLIC_ROUTES.map((r) => (
            <Row key={r.path}>
              {r.href ? (
                <Link href={r.href} className="text-primary hover:underline">
                  {r.path}
                </Link>
              ) : (
                r.path
              )}
              {r.note ? <span className="ml-2 not-italic text-foreground-muted">— {r.note}</span> : null}
            </Row>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-foreground">
          Published pages{" "}
          <span className="text-sm font-normal text-foreground-muted">
            ({pagesError ? "D1 unavailable" : `${pages.length} from D1`})
          </span>
        </h2>
        {pages.length === 0 ? (
          <p className="text-sm text-foreground-muted">
            {pagesError ? "Could not read the database." : "No pages yet — create one in /admin/pages."}
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {pages.map((p) => (
              <Row key={p.id}>
                <Link href={pathFor(p)} className="text-primary hover:underline">
                  {pathFor(p)}
                </Link>
                <span className="ml-2 text-foreground-muted">
                  — {p.publishStatus}
                  {p.parentSlug ? ` · child of /${p.parentSlug}` : ""}
                </span>
              </Row>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-foreground">Admin pages</h2>
        <ul className="flex flex-col gap-1">
          {ADMIN_PAGES.map((r) => (
            <Row key={r.path}>
              <Link href={r.href} className="text-primary hover:underline">
                {r.path}
              </Link>
            </Row>
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-lg font-medium text-foreground">
          Admin API <span className="text-sm font-normal text-foreground-muted">(auth-gated)</span>
        </h2>
        <ul className="flex flex-col gap-1">
          {ADMIN_API.map((r) => (
            <Row key={r.path}>
              {r.path}
              <span className="ml-2 text-foreground-muted">— {r.methods}</span>
            </Row>
          ))}
        </ul>
      </section>
    </main>
  );
}
