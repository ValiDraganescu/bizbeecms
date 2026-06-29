/**
 * Native HTML5 drag-and-drop payload for the Page Builder (no dnd dependency).
 *
 * A rail item carries a small JSON payload on a custom MIME type:
 *  - `{kind:"section"}`            — the LAYOUT Section primitive
 *  - `{kind:"list"}`              — the built-in List block
 *  - `{kind:"component", name}`    — a component from the components rail
 *  - `{kind:"move", id}`           — reorder/move an existing Layers node
 * Drop targets read it back via `readDragPayload`.
 */

const DND_MIME = "application/x-page-builder";

export type DragPayload =
  | { kind: "section" }
  | { kind: "list" }
  | { kind: "component"; name: string }
  | { kind: "move"; id: string };

export function setDragPayload(e: React.DragEvent, payload: DragPayload) {
  e.dataTransfer.setData(DND_MIME, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

export function readDragPayload(e: React.DragEvent): DragPayload | null {
  const raw = e.dataTransfer.getData(DND_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DragPayload;
  } catch {
    return null;
  }
}
