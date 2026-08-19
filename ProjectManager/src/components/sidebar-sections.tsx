"use client";

import { useState, type ReactNode } from "react";
import { cn } from "@/components/ui";

/** Shared sidebar item look — SidebarSections buttons and SidebarNav links. */
function itemCls(active: boolean): string {
  return cn(
    "flex h-11 items-center justify-between gap-2 rounded-md px-3 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
    active
      ? "bg-primary-subtle font-semibold text-primary"
      : "font-medium text-foreground-muted hover:bg-surface-muted hover:text-foreground",
  );
}

export type SidebarSection = {
  id: string;
  label: string;
  content: ReactNode;
  /** Let the section's content span the full pane width (dense editors). */
  wide?: boolean;
};

/**
 * Sidebar-model page shell (used by /settings, /sites, ...): section labels on
 * the left, one section's content on the right. Pure client-side toggling --
 * only the active section's content is mounted.
 *
 * Below md the sidebar becomes the page: a tappable section list that drills
 * into the section (with a back row to return to the list). `selected === null`
 * means "nothing picked yet": desktop falls back to the first section, mobile
 * shows the list. Selection is mirrored into the ?section= query param.
 */
export function SidebarSections({
  sections,
  allLabel,
  initialId,
}: {
  sections: SidebarSection[];
  allLabel: string;
  /** Deep-link target (?section=…): pre-selects a section on first render. */
  initialId?: string;
}) {
  const [selected, setSelected] = useState<string | null>(
    initialId && sections.some((s) => s.id === initialId) ? initialId : null,
  );
  const activeId = selected ?? sections[0]?.id;
  const active = sections.find((s) => s.id === activeId);

  /**
   * Select a section and mirror it into ?section= (Next 16 shallow history —
   * no server round-trip) so refresh and share land on the same section.
   * replaceState, not pushState: Back should leave the page, not unwind
   * every section click.
   */
  function select(id: string | null) {
    setSelected(id);
    const url = new URL(window.location.href);
    if (id === null) url.searchParams.delete("section");
    else url.searchParams.set("section", id);
    window.history.replaceState(null, "", url);
  }

  return (
    <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
      <nav
        className={cn(
          "w-full flex-col gap-0.5 md:flex md:w-56 md:shrink-0",
          selected === null ? "flex" : "hidden",
        )}
        aria-label={allLabel}
      >
        {sections.map((s) => {
          const isActive = s.id === activeId;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => select(s.id)}
              aria-current={isActive ? "true" : undefined}
              className={itemCls(isActive)}
            >
              {s.label}
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                className="shrink-0 md:hidden"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          );
        })}
      </nav>

      <div
        className={cn(
          "min-w-0 flex-1 md:block",
          active?.wide ? null : "md:max-w-3xl",
          selected === null ? "hidden" : "block",
        )}
      >
        <button
          type="button"
          onClick={() => select(null)}
          className="mb-4 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-foreground-muted outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:hidden"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          {allLabel}
        </button>
        {active?.content}
      </div>
    </div>
  );
}
