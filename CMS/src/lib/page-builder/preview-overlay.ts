/**
 * In-iframe selection overlay for the Preview tab.
 *
 * The preview is a SAME-ORIGIN iframe (`/preview/<id>`), so the parent reaches
 * into its document directly — no postMessage bridge needed. Every selectable
 * block already carries a data attribute from the renderer:
 *   `data-block-wrap` (a component leaf) / `data-section` (a section).
 * We outline them on hover, mark the selected one, and report a click up so the
 * shell can select it exactly like a Layers click (same `setSelectedBlockId`).
 *
 * ponytail: parent-driven DOM listeners over a message bridge — same origin, so
 * skip the protocol. Re-run `wirePreviewOverlay` on every iframe load.
 */

const STYLE_ID = "bb-preview-overlay-style";
const SELECTED_ATTR = "data-bb-selected";
const LABEL_ID = "bb-preview-hover-label";

// Attributes that mark a selectable block, most specific first. A click finds
// the NEAREST of these so a click on a leaf component selects the component, not
// its enclosing section.
const BLOCK_ATTRS = ["data-block-wrap", "data-section"] as const;

// `!important` so a component's own `outline:none`/reset can't win; negative
// offset draws the outline INSIDE the box so edge blocks aren't clipped. Hover
// only paints the INNERMOST hovered block (`:hover:not(:has(…:hover))`) so a
// parent section doesn't also outline when you're over a child component.
const OVERLAY_CSS = `
[data-block-wrap], [data-section] { cursor: pointer; }
[data-block-wrap]:hover:not(:has([data-block-wrap]:hover)),
[data-section]:hover:not(:has([data-section]:hover, [data-block-wrap]:hover)) {
  outline: 2px dashed var(--color-primary, #2563eb) !important;
  outline-offset: -2px !important;
}
[${SELECTED_ATTR}] {
  outline: 2px solid var(--color-primary, #2563eb) !important;
  outline-offset: -2px !important;
}
#${LABEL_ID} {
  position: fixed;
  z-index: 2147483647;
  top: 0; left: 0;
  padding: 2px 6px;
  font: 500 11px/1.4 ui-sans-serif, system-ui, sans-serif;
  color: #fff;
  background: var(--color-primary, #2563eb);
  border-radius: 3px;
  pointer-events: none;
  white-space: nowrap;
  display: none;
}
`;

/**
 * The NEAREST selectable element to `el` (most-specific attr wins, so a leaf
 * component beats its enclosing section) + its id. Null if none. One walk drives
 * both click-select and hover-label so they agree on which block is "under" the
 * cursor.
 */
function nearestBlockWithId(el: Element | null): { el: Element; id: string } | null {
  for (const attr of BLOCK_ATTRS) {
    const hit = el?.closest(`[${attr}]`);
    const id = hit?.getAttribute(attr);
    if (hit && id) return { el: hit, id };
  }
  return null;
}

/**
 * Wire click-to-select + hover outlines into a freshly-loaded preview iframe.
 * `onSelect` fires with the clicked block's id. Returns a cleanup function (call
 * before re-wiring / on unmount). Safe to call with a not-yet-ready iframe.
 */
export function wirePreviewOverlay(
  iframe: HTMLIFrameElement | null,
  onSelect: (blockId: string) => void,
  labelFor?: (blockId: string) => string | null,
): () => void {
  const doc = iframe?.contentDocument;
  if (!doc) return () => {};

  if (!doc.getElementById(STYLE_ID)) {
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = OVERLAY_CSS;
    doc.head?.appendChild(style);
  }

  // A floating label chip that names the hovered block (section/component). It
  // tracks the innermost hovered block — the SAME element the CSS `:hover`
  // outlines — and sits just above (or, near the top edge, just below) it.
  let label = doc.getElementById(LABEL_ID) as HTMLElement | null;
  if (!label) {
    label = doc.createElement("div");
    label.id = LABEL_ID;
    doc.body?.appendChild(label);
  }
  const labelEl = label;

  const positionLabel = (target: Element) => {
    const hit = nearestBlockWithId(target);
    const name = hit ? labelFor?.(hit.id) ?? null : null;
    if (!hit || !name) {
      labelEl.style.display = "none";
      return;
    }
    const r = hit.el.getBoundingClientRect();
    labelEl.textContent = name;
    labelEl.style.display = "block";
    // Above the box by default; if that clips off the top, drop it just inside.
    const lh = labelEl.offsetHeight || 18;
    const top = r.top - lh - 2 >= 0 ? r.top - lh - 2 : r.top + 2;
    labelEl.style.left = `${Math.max(0, r.left)}px`;
    labelEl.style.top = `${top}px`;
  };

  const onMove = (e: MouseEvent) => positionLabel(e.target as Element);
  const onLeave = () => {
    labelEl.style.display = "none";
  };
  // mousemove (not just mouseover) so the label re-anchors as the cursor crosses
  // between sibling blocks without leaving the document.
  doc.addEventListener("mousemove", onMove, true);
  doc.addEventListener("mouseleave", onLeave, true);

  const onClick = (e: MouseEvent) => {
    const hit = nearestBlockWithId(e.target as Element | null);
    if (!hit) return;
    // The preview is read-only chrome — never follow a link or submit on select.
    e.preventDefault();
    e.stopPropagation();
    onSelect(hit.id);
  };
  doc.addEventListener("click", onClick, true);

  return () => {
    doc.removeEventListener("click", onClick, true);
    doc.removeEventListener("mousemove", onMove, true);
    doc.removeEventListener("mouseleave", onLeave, true);
    labelEl.remove();
  };
}

/**
 * Mark `blockId`'s element as selected inside the iframe (clears any previous).
 * No-op when the iframe isn't ready or the id isn't present (e.g. a Section
 * column, which the renderer tags but we don't outline as a leaf).
 */
export function markSelectedInPreview(
  iframe: HTMLIFrameElement | null,
  blockId: string | null,
): void {
  const doc = iframe?.contentDocument;
  if (!doc) return;
  doc.querySelectorAll(`[${SELECTED_ATTR}]`).forEach((el) => el.removeAttribute(SELECTED_ATTR));
  if (!blockId) return;
  for (const attr of BLOCK_ATTRS) {
    const el = doc.querySelector(`[${attr}="${CSS.escape(blockId)}"]`);
    if (el) {
      el.setAttribute(SELECTED_ATTR, "");
      el.scrollIntoView({ block: "nearest" });
      return;
    }
  }
}
