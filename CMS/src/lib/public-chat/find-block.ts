/**
 * Public guest-chat — PURE block lookup (Slice 4).
 *
 * The public `/api/public-chat` endpoint re-reads the PUBLISHED page's block tree
 * and must find the exact GuestChat block a visitor named — mirroring the Form
 * security model (`findFormBlock`, submit-core.ts): the browser sends only a
 * page + block id, and the target is re-resolved server-side, so a visitor can
 * only ever talk to an agent an operator actually published.
 *
 * Dep-free (only the reserved component-name constant + the `Block` type from the
 * renderer's lowest layer), so it runs under the project's `node --test` suite.
 */
import { GUEST_CHAT_COMPONENT, type Block } from "../render/plan-types.ts";

/**
 * Find the GuestChat block with `blockId` anywhere in the published page's block
 * tree. Only a block whose component IS the GuestChat built-in counts — a visitor
 * naming some other block's id (or a block that isn't a chat) gets nothing.
 * Recursive over `children`, exactly like `findFormBlock`.
 */
export function findGuestChatBlock(blocks: Block[], blockId: string): Block | null {
  for (const b of blocks) {
    if (b.id === blockId) return b.component === GUEST_CHAT_COMPONENT ? b : null;
    if (b.children) {
      const hit = findGuestChatBlock(b.children, blockId);
      if (hit) return hit;
    }
  }
  return null;
}
