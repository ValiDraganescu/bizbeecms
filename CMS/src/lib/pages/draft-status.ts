/**
 * PURE draft-save status logic for the page-builder shell (Versioning slice 3).
 *
 * The shell auto-saves edits to the DRAFT on a debounce, has a manual Save
 * (immediate draft save) and a separate Publish. The status badge it shows
 * ("saving…" / "saved" / "published" / "error") is driven by a tiny state
 * machine kept here so it's node-testable without React/D1.
 *
 * State transitions (event → next state):
 *   edit       → "dirty"      (queued; debounce pending)
 *   saveStart  → "saving"
 *   saveDone   → "saved"
 *   publishDone→ "published"
 *   error      → "error"
 *   loaded     → "saved"      (a freshly opened/loaded page is in sync)
 */
export type DraftStatus = "saved" | "dirty" | "saving" | "published" | "error";

export type DraftEvent = "edit" | "saveStart" | "saveDone" | "publishDone" | "error" | "loaded";

export function nextDraftStatus(current: DraftStatus, event: DraftEvent): DraftStatus {
  switch (event) {
    case "edit":
      // a new edit while saving still means there's unsaved work coming
      return "dirty";
    case "saveStart":
      return "saving";
    case "saveDone":
      return "saved";
    case "publishDone":
      return "published";
    case "error":
      return "error";
    case "loaded":
      return "saved";
    default:
      return current;
  }
}

/** The i18n key under `pageBuilder.draftStatus.*` for a status (null = show nothing). */
export function draftStatusKey(status: DraftStatus): string | null {
  switch (status) {
    case "saving":
      return "saving";
    case "saved":
      return "saved";
    case "published":
      return "published";
    case "error":
      return "error";
    case "dirty":
      return "unsaved";
    default:
      return null;
  }
}
