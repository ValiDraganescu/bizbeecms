import type { Metadata } from "next";
import { SettingsNav } from "@/components/settings/settings-nav";
import { IconSetEditor } from "@/components/settings/icon-set-editor";
import { getIconSet } from "@/db/settings-store";
import { DEFAULT_ICON_SET, ICON_SET_OPTIONS } from "@/lib/render/icons";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Icon set" };

/**
 * Icon-set settings page (icon-sets epic). Choose the freely-licensed icon
 * library components resolve `{{icon "name"}}` slots against. Explicit route →
 * wins over the public `[[...slug]]` catch-all.
 */
export default async function IconSetPage() {
  let initial = DEFAULT_ICON_SET;
  try {
    initial = await getIconSet();
  } catch {
    /* unbound D1 in this env — render the default */
  }

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <SettingsNav />
      <header>
        <h1 className="text-2xl font-semibold text-foreground">Icon set</h1>
        <p className="mt-1 text-foreground-muted">
          Pick the icon library your components draw from. Icons are referenced by
          name and inherit your theme colors.
        </p>
      </header>
      <IconSetEditor initial={initial} options={ICON_SET_OPTIONS} />
    </main>
  );
}
