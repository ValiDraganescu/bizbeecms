/**
 * ai-widget-ux — pure geometry for the resizable assistant panel.
 *
 * Two presets: "default" (the original compact panel) and "half" (≈half the
 * viewport). The user can also free-drag (CSS `resize`) to a custom size, which
 * we persist as exact px and restore clamped to the current viewport so a panel
 * sized on a big screen can never vanish off a small one.
 */

export type PanelPreset = "default" | "half";

export interface PanelSize {
  /** which preset the toggle is on; "custom" once the user free-drags */
  preset: PanelPreset | "custom";
  /** explicit pixel size to apply (already clamped) */
  width: number;
  height: number;
}

export const PANEL_MIN_W = 300;
export const PANEL_MIN_H = 320;
// Keep a margin so the panel + its 6px/24px offsets stay on-screen.
const MARGIN = 32;

/** Compact default — matches the legacy `w-[min(92vw,380px)] h-[min(70vh,560px)]`. */
export function defaultSize(vw: number, vh: number): { width: number; height: number } {
  return { width: Math.min(380, vw * 0.92), height: Math.min(560, vh * 0.7) };
}

/** Half-screen preset — roughly 50vw × 80vh, still clamped to sane bounds. */
export function halfSize(vw: number, vh: number): { width: number; height: number } {
  return { width: Math.min(720, Math.max(PANEL_MIN_W, vw * 0.5)), height: vh * 0.8 };
}

export function clamp(width: number, height: number, vw: number, vh: number): { width: number; height: number } {
  const maxW = Math.max(PANEL_MIN_W, vw - MARGIN);
  const maxH = Math.max(PANEL_MIN_H, vh - MARGIN);
  return {
    width: Math.round(Math.min(maxW, Math.max(PANEL_MIN_W, width))),
    height: Math.round(Math.min(maxH, Math.max(PANEL_MIN_H, height))),
  };
}

/** Resolve a preset (or restore custom px) to an applied, clamped size. */
export function resolveSize(
  preset: PanelPreset | "custom",
  stored: { width: number; height: number } | null,
  vw: number,
  vh: number,
): PanelSize {
  let base: { width: number; height: number };
  if (preset === "half") base = halfSize(vw, vh);
  else if (preset === "custom" && stored) base = stored;
  else base = defaultSize(vw, vh);
  const c = clamp(base.width, base.height, vw, vh);
  return { preset, width: c.width, height: c.height };
}

/**
 * The expand/shrink toggle. It must be a true 2-state cycle so clicking the
 * button always reverses the last toggle. We key off whether the panel is
 * currently enlarged (`isLarge`) rather than the raw preset, because expanding
 * can re-capture as "custom" (native resize fires onMouseUp on the expand
 * click) — and a "custom" state must shrink back, not jump to half again
 * (that one-way bug is why this takes `isLarge`, not just `current`).
 */
export function nextPreset(current: PanelPreset | "custom", isLarge = current === "half"): PanelPreset {
  return isLarge ? "default" : "half";
}

/**
 * Is the panel currently enlarged (vs. the compact default)? Used by the
 * expand toggle + button state so a free-dragged "custom" size that's bigger
 * than default still reads as "large" and shrinks back on click. Compares
 * against the default width with a small tolerance for rounding.
 */
export function isLarge(size: { width: number }, vw: number, vh: number, tol = 8): boolean {
  return size.width > defaultSize(vw, vh).width + tol;
}

const KEY = "bizbee.chat.panelSize";

export function loadPref(): { preset: PanelPreset | "custom"; width: number; height: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const j = JSON.parse(raw) as { preset?: string; width?: number; height?: number };
    const preset = j.preset === "half" || j.preset === "custom" ? j.preset : "default";
    if (typeof j.width !== "number" || typeof j.height !== "number") return { preset, width: 0, height: 0 };
    return { preset, width: j.width, height: j.height };
  } catch {
    return null;
  }
}

export function savePref(pref: { preset: PanelPreset | "custom"; width: number; height: number }): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(pref));
  } catch {
    /* private mode / no storage — pref just won't persist */
  }
}
