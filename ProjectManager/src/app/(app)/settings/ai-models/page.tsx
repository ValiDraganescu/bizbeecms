import { redirect } from "next/navigation";

/** AI model curation moved into /settings (sidebar section) — keep old links working. */
export default function AiModelsSettingsPage() {
  redirect("/settings?section=aiModels");
}
