import type { Metadata } from "next";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ChatAgentConversationsPage } from "@/components/content/chat-agent-conversations-page";
import { checkAdminFromHeaders } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Per-agent conversations sub-page: /admin/chat-agents/[id]/conversations.
 * Guest transcripts + usage, one click from the agents list (the Conversations
 * button) instead of buried inside the edit form. Admin only — the
 * /api/chat-agents layer is the real enforcement; this gate is UI defense
 * (list-page pattern). Copy is hardcoded English.
 */
export const metadata: Metadata = { title: "Chat agent conversations" };

export default async function ChatAgentConversationsRoute({
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
          <h1 className="text-2xl font-semibold text-foreground">Conversations</h1>
          <p className="mt-1 text-foreground-muted">
            Guest conversations recorded for this chat agent — review, download,
            or delete any transcript.
          </p>
        </div>
        <LocaleSwitcher />
      </header>
      {decision.allow ? (
        <ChatAgentConversationsPage id={id} />
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
