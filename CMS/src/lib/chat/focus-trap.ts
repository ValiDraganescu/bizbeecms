/**
 * Focus-trap math for the AI-assistant chat panel (ai-widget-ux).
 *
 * Pure index logic so the keyboard cycling is testable without a DOM. The
 * widget collects its focusable elements (in DOM order) and asks: given the
 * one that currently has focus, which index should receive focus on the next
 * Tab / Shift+Tab so focus never escapes the open dialog?
 *
 * - Forward (Shift off): wrap from the last element back to the first.
 * - Backward (Shift on): wrap from the first element back to the last.
 * - When focus is currently OUTSIDE the trap (current === -1), Tab lands on the
 *   first element and Shift+Tab on the last — pulling stray focus back in.
 */
export function nextTabStop(count: number, current: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  if (shift) return current === 0 ? count - 1 : current - 1;
  return current === count - 1 ? 0 : current + 1;
}
