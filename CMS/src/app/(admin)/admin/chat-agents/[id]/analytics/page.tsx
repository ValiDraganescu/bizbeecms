import type { Metadata } from "next";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ChatAgentAnalyticsPage } from "@/components/content/chat-agent-analytics-page";
import { checkAdminFromHeaders } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Per-agent analytics sub-page: /admin/chat-agents/[id]/analytics.
 * Last-7-days usage (messages/tokens), one click from the agents list (the
 * Analytics button) instead of buried inside the edit form. Admin only — the
 * /api/chat-agents layer is the real enforcement; this gate is UI defense
 * (list-page pattern). Copy is hardcoded English.
 */
export const metadata: Metadata = { title: "Chat agent analytics" };

export default async function ChatAgentAnalyticsRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const decision = await checkAdminFromHeaders();
  const { id } = await params;

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Analytics</h1>
          <p className="mt-1 text-foreground-muted">
            Daily message and token usage recorded for this chat agent.
          </p>
        </div>
        <LocaleSwitcher />
      </header>
      {decision.allow ? (
        <ChatAgentAnalyticsPage id={id} />
      ) : (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          You do not have permission to manage chat agents.
        </p>
      )}
    </main>
  );
}
