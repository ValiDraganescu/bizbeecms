import { redirect } from "next/navigation";

/**
 * `/admin/settings` has no content of its own — land on the first section so a
 * direct visit (or stale link) never shows a blank page under the settings rail.
 */
export default function SettingsIndexPage() {
  redirect("/admin/settings/content-locales");
}
