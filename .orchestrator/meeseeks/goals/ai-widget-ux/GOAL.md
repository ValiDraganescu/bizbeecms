# Goal: ai-widget-ux
> Decomposes [main goal](../main/GOAL.md). The root north star is the ultimate yardstick.

Polish the **CMS AI-assistant widget** (the Intercom-style chat panel) into a comfortable,
persistent tool. This is pure CLIENT/UX work on the widget components — NO provider, key, or
model-catalog logic (that's `ai-openrouter`; the assistant itself shipped in archived `ai-assistant`).

## Scope — the widget components
- `CMS/src/components/chat/chat-widget.tsx` — the shell (open/close/minimize, model state, layout).
- `CMS/src/components/chat/chat-conversation.tsx` — transcript, input, tool cards, history seed.
- Persistence of UI prefs in localStorage; chat-history round-trip in `lib/chat/history.ts` +
  `db/chat-history-store.ts` where a feature needs stored transcript data (e.g. tool calls).

## What "good" looks like
- The panel is **resizable** (drag + preset sizes: current default ⇄ half-screen), size persisted.
- The **input** is a resizable multi-row textarea with a clear **Enter-to-send ⇄ Enter-newline** switch.
- **Tool-call cards** read cleanly (no duplicated name) and expand (accordion) to show input/output.
- The transcript **survives refresh fully** — including tool calls (today only text persists).
- A **minimized widget shows an unread badge** when a new reply arrives.
- The **selected model persists** across reloads.
- Every change: design-system tokens, in-app (no native confirm/dialog that breaks browser-review),
  EN/FI/ET for new strings, and gated on CMS tsc + `npm test` + `npx opennextjs-cloudflare build`
  (dev OFF) + cms-bundle regen.

## Out of scope
- Model catalog data (prices, modality fields, tool-capability filter, credit display) — `ai-openrouter`.
- File attachments — `ai-attachments`.
- The assistant's tools / page-awareness / system prompt — shipped in archived `ai-assistant`.
