/**
 * In-page channel for pushing image attachments into the chat composer from a
 * SIBLING surface (the Components → Develop workbench's "Send preview to AI"
 * button). Same store/subscribe shape as `component-context.ts`: Develop captures
 * the component at each viewport and emits the PNGs here; `ChatConversation`
 * subscribes and drops them into its pending attachments so the operator just
 * hits Send and the vision model sees the renders.
 *
 * The widget and the workbench are siblings in the layout (no prop path), so a
 * module-level pub/sub is the lazy cross-component channel — no context provider
 * threaded through the tree.
 */

/** One captured viewport screenshot, ready to inline as a chat image attachment. */
export interface ChatImageAttachment {
  /** A data URL: `data:image/png;base64,...`. */
  dataUrl: string;
  /** Display/file name, e.g. "Hero — mobile (375px).png". */
  name: string;
  /** MIME, always image/* here. */
  mime: string;
}

/** A batch of captures + an optional caption to prefill the composer with. */
export interface ChatAttachBatch {
  images: ChatImageAttachment[];
  caption?: string;
}

const listeners = new Set<(batch: ChatAttachBatch) => void>();
// The composer (ChatConversation) UNMOUNTS when the widget is closed, so a batch
// emitted while it's closed has no live listener. Buffer the latest unconsumed
// batch and replay it to the next subscriber that mounts (when the widget opens).
let pending: ChatAttachBatch | null = null;

/** Push a batch of captured images into the composer (no-op outside the browser). */
export function emitChatAttachments(batch: ChatAttachBatch): void {
  if (typeof window === "undefined") return;
  if (listeners.size === 0) {
    pending = batch; // no composer mounted yet → hold for the next subscriber
    return;
  }
  for (const fn of listeners) fn(batch);
}

/**
 * Subscribe to emitted batches. Returns an unsubscribe fn. If a batch was emitted
 * while no composer was mounted, it's delivered immediately on subscribe (once).
 */
export function subscribeChatAttachments(
  fn: (batch: ChatAttachBatch) => void,
): () => void {
  listeners.add(fn);
  if (pending) {
    const batch = pending;
    pending = null;
    fn(batch);
  }
  return () => listeners.delete(fn);
}

// ── Open the chat widget (sibling of the Develop workbench) ──────────────────
export const CHAT_OPEN_EVENT = "cms:chat-open";

/** Ask the floating chat widget to open (no-op outside the browser). */
export function requestChatOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CHAT_OPEN_EVENT));
}
