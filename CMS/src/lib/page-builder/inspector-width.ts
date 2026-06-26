/**
 * page-builder-ux — pure geometry for the resizable right-side inspector panel.
 *
 * Three presets for the Block/Page/SEO inspector column:
 *   - "default" — the original fixed 320px width
 *   - "quarter" — ¼ of the editor (canvas) width
 *   - "half"    — ½ of the editor width
 *
 * The width is resolved against the live editor width and CLAMPED so the canvas
 * to its left can never be squeezed to nothing (mirrors the AI widget's
 * lib/chat/panel-size.ts preset+persist+clamp approach).
 */

export type InspectorPreset = "default" | "quarter" | "half";

/** The original fixed inspector width (px) — the "default" preset. */
export const INSPECTOR_DEFAULT_W = 320;
/** Never narrower than this (a usable inspector). */
export const INSPECTOR_MIN_W = 280;
/** Always leave at least this much for the canvas/layers area to its left. */
export const CANVAS_MIN_W = 360;

const PRESETS: readonly InspectorPreset[] = ["default", "quarter", "half"] as const;

/** Coerce an unknown stored value to a valid preset (default on anything else). */
export function resolvePreset(stored: string | null | undefined): InspectorPreset {
  return PRESETS.includes(stored as InspectorPreset) ? (stored as InspectorPreset) : "default";
}

/**
 * Resolve a preset to a concrete pixel width given the total editor width
 * (`editorW` = the 3-column area). The result is clamped to [INSPECTOR_MIN_W,
 * editorW - CANVAS_MIN_W] so the canvas keeps a minimum and the inspector stays
 * usable. On tiny editors the canvas-minimum wins (inspector falls back toward
 * its minimum). Unknown editorW (<= 0) → the plain default width.
 */
export function inspectorWidth(preset: InspectorPreset, editorW: number): number {
  if (!Number.isFinite(editorW) || editorW <= 0) return INSPECTOR_DEFAULT_W;
  let target: number;
  if (preset === "quarter") target = editorW * 0.25;
  else if (preset === "half") target = editorW * 0.5;
  else target = INSPECTOR_DEFAULT_W;
  const maxW = Math.max(INSPECTOR_MIN_W, editorW - CANVAS_MIN_W);
  return Math.round(Math.min(maxW, Math.max(INSPECTOR_MIN_W, target)));
}

const KEY = "bizbee.builder.inspectorWidth";

export function loadInspectorPreset(): InspectorPreset {
  try {
    return resolvePreset(localStorage.getItem(KEY));
  } catch {
    return "default";
  }
}

export function saveInspectorPreset(preset: InspectorPreset): void {
  try {
    localStorage.setItem(KEY, preset);
  } catch {
    /* private mode / no storage — pref just won't persist */
  }
}
