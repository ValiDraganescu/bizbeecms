import type { Metadata } from "next";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { ChatAgentsManager } from "@/components/content/chat-agents-manager";
import { checkAdminFromHeaders } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/**
 * public-guest-chatbots Slice 7 — the management UI for guest-facing ChatAgents:
 * persona/system prompt, model, usage limits, and the allowlist of data-source
 * saved requests + collections the bot may touch. Admin only — the
 * /api/chat-agents layer is the real enforcement; this gate is UI defense
 * (data-sources page pattern). Copy is hardcoded English (this minimal admin
 * surface predates a translated key set).
 */
export const metadata: Metadata = { title: "Chat agents" };

export default async function ChatAgentsPage() {
  const decision = await checkAdminFromHeaders();

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Chat agents</h1>
          <p className="mt-1 text-foreground-muted">
            Configure guest-facing chatbots — persona, model, usage limits, and
            exactly which saved requests and collections they may touch.
          </p>
        </div>
        <LocaleSwitcher />
      </header>
      {decision.allow ? (
        <ChatAgentsManager />
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
