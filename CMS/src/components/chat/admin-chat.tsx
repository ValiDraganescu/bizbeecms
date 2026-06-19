"use client";

/**
 * CMS admin chat UI (Milestone 2, B-track) — the FULL-PAGE `/admin/chat` front
 * end for the `/api/chat` AI assistant. Thin wrapper around the shared
 * `ChatConversation` core (see `chat-conversation.tsx`); the floating
 * `ChatWidget` renders the same core, so there is ONE chat pipeline.
 */

import { ChatConversation, useChat } from "@/components/chat/chat-conversation";

export function AdminChat() {
  const chat = useChat();
  return (
    <div className="flex h-[60vh] flex-col">
      <ChatConversation chat={chat} transcriptClassName="flex-1" />
    </div>
  );
}
