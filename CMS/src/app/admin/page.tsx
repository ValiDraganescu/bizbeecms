import type { Metadata } from "next";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { ADMIN_SECTIONS } from "@/components/admin-sections";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("adminNav");
  return { title: t("indexTitle") };
}

/**
 * CMS admin landing page (slice #6). A home for the whole admin surface — now
 * that /admin/layout.tsx gates it — linking to each section with a one-line
 * description. Pure navigation, no data fetch, but wrapped in try/catch on the
 * translations so a missing-config render still produces a safe page (CAVEATS
 * pattern). Explicit /admin route wins over the public [[...slug]] catch-all.
 */
export default async function AdminIndexPage() {
  let t: Awaited<ReturnType<typeof getTranslations>>;
  try {
    t = await getTranslations("adminNav");
  } catch {
    // Defensive: if i18n context is somehow unavailable, fall back to keys so the
    // page still renders rather than 500-ing the gated surface.
    const id = (k: string) => k;
    return (
      <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
        <h1 className="text-2xl font-semibold text-foreground">{id("CMS admin")}</h1>
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("indexTitle")}</h1>
        <p className="mt-1 text-foreground-muted">{t("indexSubtitle")}</p>
      </header>
      <ul className="grid gap-4 sm:grid-cols-2">
        {ADMIN_SECTIONS.map(({ key, href }) => (
          <li key={href}>
            <Link
              href={href}
              className="block h-full rounded-lg border border-border bg-surface-raised p-4 transition-colors hover:border-primary hover:bg-surface"
            >
              <h2 className="font-medium text-foreground">{t(key)}</h2>
              <p className="mt-1 text-sm text-foreground-muted">{t(`desc.${key}`)}</p>
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
