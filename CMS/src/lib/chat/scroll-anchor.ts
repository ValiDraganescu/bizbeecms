/**
 * Pure scroll-anchor helper for the chat transcript (ai-widget-ux).
 *
 * The transcript auto-scrolls to the newest message while you sit at the bottom.
 * But if you scroll UP to re-read something and a new reply streams in, yanking
 * you back down is hostile. So the widget shows a "jump to latest" pill instead.
 * This decides "am I parked at the bottom?" with a small pixel tolerance so a
 * sub-pixel layout drift (common with streaming tokens) doesn't flap the pill.
 */
export function isAtBottom(
  { scrollTop, scrollHeight, clientHeight }: { scrollTop: number; scrollHeight: number; clientHeight: number },
  tolerance = 24,
): boolean {
  return scrollHeight - (scrollTop + clientHeight) <= tolerance;
}
