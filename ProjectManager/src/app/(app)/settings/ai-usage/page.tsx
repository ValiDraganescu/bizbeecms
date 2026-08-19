import { redirect } from "next/navigation";

/** Fleet AI usage moved into /settings (sidebar section) — keep old links working. */
export default function AiUsagePage() {
  redirect("/settings?section=aiUsage");
}
