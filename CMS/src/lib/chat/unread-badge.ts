/**
 * ai-widget-ux — pure logic for the minimized-widget unread badge.
 *
 * The launcher bubble shows an unread dot when the assistant finishes a reply
 * while the panel is closed (minimized). It clears the moment the user opens
 * the panel. No count, no sound — a single dot is enough.
 *
 * `nextUnread` is the only decision: given the current unread flag and what
 * just happened (panel open? a reply just finished?), should the badge be on?
 */

export interface BadgeInput {
  /** Is the panel currently open? Opening always clears the badge. */
  open: boolean;
  /** True only on the busy→idle EDGE when a reply just completed. */
  replyFinished: boolean;
}

/** Next value of the "has unread" flag. */
export function nextUnread(current: boolean, { open, replyFinished }: BadgeInput): boolean {
  if (open) return false; // seeing the panel clears unread
  if (replyFinished) return true; // a reply landed while minimized
  return current; // otherwise unchanged
}
