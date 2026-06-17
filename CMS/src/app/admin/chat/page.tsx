import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { AdminChat } from "@/components/chat/admin-chat";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("chat");
  return { title: t("title") };
}

/**
 * CMS admin chat page (Milestone 2, B-track). The in-browser front-end for the
 * `/api/chat` AI assistant: the user describes what they want, the assistant
 * streams a reply and may call tools (create_component / create_page /
 * translate) whose results show as cards. This is an explicit `/admin/chat`
 * route, so it wins over the public `[[...slug]]` catch-all.
 */
export default async function ChatPage() {
  const t = await getTranslations("chat");
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">{t("title")}</h1>
          <p className="mt-1 text-foreground-muted">{t("subtitle")}</p>
        </div>
        <LocaleSwitcher />
      </header>
      <AdminChat />
    </main>
  );
}
