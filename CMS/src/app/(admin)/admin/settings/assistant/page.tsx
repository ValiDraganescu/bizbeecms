import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { ConversationsPanel, UsagePanel } from "@/components/content/chat-agents-shared";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("assistantChats");
  return { title: t("title") };
}

/**
 * assistant-conversations — the CMS-assistant twin of the per-agent analytics +
 * conversations pages, under Settings › AI. Reuses the SAME shared panels the
 * chat agents use, pointed at the `/api/chat` endpoint base (identical wire
 * contract): daily messages/tokens/billable-cost usage on top, then the
 * paginated conversation list with gateway-fidelity download + delete. The
 * /api/chat/* layer is the real admin enforcement (page shell pattern).
 */
export default async function AssistantChatsPage() {
  const t = await getTranslations("assistantChats");

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
        <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
      </header>
      <div className="rounded-lg border border-border bg-surface-raised p-4">
        <UsagePanel api="/api/chat" />
      </div>
      <div className="rounded-lg border border-border bg-surface-raised p-4">
        <ConversationsPanel api="/api/chat" />
      </div>
    </main>
  );
}
