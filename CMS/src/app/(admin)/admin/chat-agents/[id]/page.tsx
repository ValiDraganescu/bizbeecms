import type { Metadata } from "next";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ChatAgentEditPage } from "@/components/content/chat-agent-edit-page";
import { checkAdminFromHeaders } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * Per-agent edit sub-page: /admin/chat-agents/[id]. The list page's Edit button
 * navigates here; the client component fetches the agent, renders the shared
 * editor, and publishes the agent's FULL config to the AI assistant's context
 * channel (so the assistant edits THIS agent without a discovery round-trip).
 * Admin only — the /api/chat-agents layer is the real enforcement; this gate is
 * UI defense (list-page pattern). Copy is hardcoded English.
 */
export const metadata: Metadata = { title: "Edit chat agent" };

export default async function ChatAgentEditRoute({
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
          <h1 className="text-2xl font-semibold text-foreground">Edit chat agent</h1>
          <p className="mt-1 text-foreground-muted">
            Persona, model, usage limits, and exactly which saved requests and
            collections this bot may touch.
          </p>
        </div>
        <LocaleSwitcher />
      </header>
      {decision.allow ? (
        <ChatAgentEditPage id={id} />
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
