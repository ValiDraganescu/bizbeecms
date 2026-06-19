import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PageBuilderShell } from "@/components/page-builder/page-builder-shell";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("pageBuilder");
  return { title: t("title") };
}

/**
 * Page Builder (epic: page-builder) — the visual editor surface where an operator
 * composes a Site's pages from blocks/components. THIS slice is LAYOUT ONLY: the
 * top-bar + 3-column shell (Components rail / Layers⟷Preview center / Block·Page·SEO
 * right rail), with empty states and responsive frame sizing. No page loading, no
 * drag-to-insert, no live preview wiring, no settings logic — those come in later
 * slices. Explicit `/admin/page-builder` route. See docs/page-builder-layout.md.
 */
export default function PageBuilderPage() {
  return <PageBuilderShell />;
}
