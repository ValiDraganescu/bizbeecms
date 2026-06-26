/**
 * page-builder-ux — collapse state for the builder's two side rails.
 *
 * The left Components rail and the right Block/Page/SEO inspector can each be
 * collapsed entirely to maximize the canvas, then re-expanded. Each side's
 * collapsed state persists across reloads in localStorage (mirrors the
 * sidemenu's collapse affordance + inspector-width.ts persist pattern).
 *
 * Default is EXPANDED on anything unknown (a fresh operator sees both rails).
 */

export type BuilderSide = "left" | "right";

const KEY: Record<BuilderSide, string> = {
  left: "bizbee.builder.leftCollapsed",
  right: "bizbee.builder.rightCollapsed",
};

/** Coerce a stored value to a boolean collapsed flag (default false = expanded). */
export function resolveCollapsed(stored: string | null | undefined): boolean {
  return stored === "true";
}

export function loadCollapsed(side: BuilderSide): boolean {
  try {
    return resolveCollapsed(localStorage.getItem(KEY[side]));
  } catch {
    return false;
  }
}

export function saveCollapsed(side: BuilderSide, collapsed: boolean): void {
  try {
    localStorage.setItem(KEY[side], String(collapsed));
  } catch {
    /* private mode / no storage — pref just won't persist */
  }
}
