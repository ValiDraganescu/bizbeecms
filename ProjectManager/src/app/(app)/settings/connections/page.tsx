import { redirect } from "next/navigation";

/** MCP connections moved into /settings (sidebar section) — keep old links working. */
export default function ConnectionsPage() {
  redirect("/settings?section=connections");
}
