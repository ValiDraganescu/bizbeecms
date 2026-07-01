"use client";

/**
 * Link prop editor: free-text href + a "pick a page" dropdown + an "open in new
 * tab" toggle. Shared by the page-builder props panel and the Develop props
 * sidebar (both edit link-ish props — see `isLinkProp`).
 *
 * - The text input is authoritative: the page dropdown just writes a page path
 *   into it, so an author can still type any external URL (https://…, mailto:…).
 * - "Open in new tab" is a SEPARATE boolean the parent stores in the companion
 *   `<name>NewTab` prop; the renderer turns it into target/rel on the anchor
 *   (see plan-tree `applyNewTab`). Passed in as `newTab` / `onNewTab`.
 *
 * Pages are fetched once from GET /api/pages and cached at module scope (the list
 * rarely changes during an editing session; a reload refetches).
 */

import { useEffect, useState } from "react";
import { flattenPagesForPicker, type PageOption } from "@/lib/pages/page-picker";
import type { PageSummary } from "@/db/page-store";

const input =
  "rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground focus:border-primary focus:outline-none";

// Module-scoped cache + in-flight promise so N link inputs on one panel share a
// single fetch. ponytail: a plain module var, not a context/store — the page list
// is tiny and session-stable; a hard reload gets a fresh list.
let pagesCache: PageOption[] | null = null;
let pagesInFlight: Promise<PageOption[]> | null = null;

async function loadPages(): Promise<PageOption[]> {
  if (pagesCache) return pagesCache;
  if (!pagesInFlight) {
    pagesInFlight = fetch("/api/pages")
      .then((r) => (r.ok ? (r.json() as Promise<PageSummary[]>) : []))
      .then((rows) => {
        pagesCache = flattenPagesForPicker(rows);
        return pagesCache;
      })
      .catch(() => {
        pagesCache = [];
        return pagesCache;
      });
  }
  return pagesInFlight;
}

export function LinkInput({
  value,
  onChange,
  newTab,
  onNewTab,
  ariaLabel,
  newTabLabel,
  pickPageLabel,
}: {
  value: string;
  onChange: (href: string) => void;
  newTab: boolean;
  onNewTab: (on: boolean) => void;
  ariaLabel: string;
  newTabLabel: string;
  pickPageLabel: string;
}) {
  const [pages, setPages] = useState<PageOption[]>(pagesCache ?? []);

  useEffect(() => {
    let live = true;
    void loadPages().then((p) => live && setPages(p));
    return () => {
      live = false;
    };
  }, []);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          className={`${input} flex-1`}
          value={value}
          aria-label={ariaLabel}
          onChange={(e) => onChange(e.target.value)}
        />
        {/* Page picker: writes the chosen page's path into the text input. Resets
            to its placeholder after each pick so it's a menu, not a value store. */}
        <select
          className={`${input} shrink-0`}
          aria-label={pickPageLabel}
          value=""
          disabled={pages.length === 0}
          onChange={(e) => {
            if (e.target.value) onChange(e.target.value);
          }}
        >
          <option value="">{pickPageLabel}</option>
          {pages.map((p) => (
            <option key={p.id} value={p.path}>
              {p.path}
              {p.published ? "" : " (draft)"}
            </option>
          ))}
        </select>
      </div>
      <label className="flex items-center gap-2 text-xs text-foreground-muted">
        <input
          type="checkbox"
          checked={newTab}
          onChange={(e) => onNewTab(e.target.checked)}
        />
        {newTabLabel}
      </label>
    </div>
  );
}
