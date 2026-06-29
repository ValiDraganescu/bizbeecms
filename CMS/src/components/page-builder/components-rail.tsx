"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { setDragPayload } from "@/lib/page-builder/dnd";
import { filterGroups } from "@/lib/components/rail-filter";
import type { ComponentGroup } from "@/lib/components/grouped";

/**
 * Left-rail Components panel: the LAYOUT primitive (Section) above the real
 * COMPONENTS source — kit groups from `GET /api/components/grouped`, each an
 * expandable header (kit display name or the "individually-imported" bucket)
 * listing its component names, filtered live by the search box.
 *
 * Clicking the LAYOUT "Section" adds a Section to the page; clicking a component
 * inserts it into the selected (or last) Section. Both are inert until a page is
 * selected (`canEdit`).
 *
 * ponytail: groups expanded by default (small lists); collapse state is local
 * useState keyed by group label. Click-to-insert + native HTML5 drag.
 */
export function ComponentsRail({
  groups,
  groupBy,
  onGroupByChange,
  search,
  canEdit,
  onAddSection,
  onInsertComponent,
  onInsertList,
}: {
  groups: ComponentGroup[];
  groupBy: "kit" | "tag";
  onGroupByChange: (g: "kit" | "tag") => void;
  search: string;
  canEdit: boolean;
  onAddSection: () => void;
  onInsertComponent: (component: string) => boolean;
  onInsertList: () => boolean;
}) {
  const t = useTranslations("pageBuilder");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hint, setHint] = useState<string | null>(null);

  function insert(component: string) {
    if (onInsertComponent(component)) setHint(null);
    else setHint(t("addSectionFirst"));
  }
  function insertList() {
    if (onInsertList()) setHint(null);
    else setHint(t("addSectionFirst"));
  }

  const visible = filterGroups(groups, search);

  // Map a group's `kit` field to a display label. In KIT mode it's a kit id
  // (null = individually-imported); in TAG mode it's the tag itself (null =
  // untagged). The `ComponentGroup.kit` field carries whichever.
  function groupLabel(kit: string | null): string {
    if (groupBy === "tag") return kit ?? t("tagUntagged");
    if (kit == null) return t("kitIndividual");
    // i18n keys kit.blog/kit.landing/kit.docs; fall back to the raw id.
    const key = `kit.${kit}`;
    const label = t(key);
    return label === key ? kit : label;
  }

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-3">
      {hint && (
        <p role="status" className="rounded-md bg-surface-muted px-3 py-2 text-xs text-foreground-muted">
          {hint}
        </p>
      )}
      {/* LAYOUT — the Section primitive (always present). */}
      <div>
        <p className="px-1 font-mono text-[11px] uppercase tracking-wide text-foreground-muted">
          {t("categoryLayout")}
        </p>
        <ul className="mt-1.5 space-y-1">
          <li>
            <button
              type="button"
              disabled={!canEdit}
              draggable={canEdit}
              onDragStart={(e) => setDragPayload(e, { kind: "section" })}
              onClick={onAddSection}
              className="w-full cursor-grab rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("layoutSection")}
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={!canEdit}
              onClick={insertList}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("layoutList")}
            </button>
          </li>
        </ul>
      </div>

      {/* COMPONENTS — grouped by source kit OR operator tag (toggle). */}
      <div>
        <div className="flex items-center justify-between gap-2 px-1">
          <p className="font-mono text-[11px] uppercase tracking-wide text-foreground-muted">
            {t("categoryComponents")}
          </p>
          <div className="flex rounded-md border border-border" role="group" aria-label={t("groupByLabel")}>
            {(["kit", "tag"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onGroupByChange(mode)}
                aria-pressed={groupBy === mode}
                className={`px-2 py-0.5 text-[11px] first:rounded-l-md last:rounded-r-md ${
                  groupBy === mode
                    ? "bg-surface-muted font-medium text-foreground"
                    : "text-foreground-muted hover:bg-surface-muted"
                }`}
              >
                {mode === "kit" ? t("groupByKit") : t("groupByTag")}
              </button>
            ))}
          </div>
        </div>
        {visible.length === 0 ? (
          <p className="mt-1.5 px-1 text-sm text-foreground-muted">
            {search.trim() ? t("componentsNoMatch") : t("componentsEmpty")}
          </p>
        ) : (
          <div className="mt-1.5 space-y-2">
            {visible.map((g) => {
              const label = groupLabel(g.kit);
              const isCollapsed = collapsed[label] ?? false;
              return (
                <div key={g.kit ?? "__ungrouped"}>
                  <button
                    type="button"
                    onClick={() =>
                      setCollapsed((c) => ({ ...c, [label]: !isCollapsed }))
                    }
                    aria-expanded={!isCollapsed}
                    className="flex w-full items-center justify-between rounded px-1 py-1 text-left text-xs font-medium text-foreground hover:bg-surface-muted"
                  >
                    <span>{label}</span>
                    <span className="text-foreground-muted">
                      {isCollapsed ? "+" : "−"}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <ul className="mt-1 space-y-1">
                      {g.components.map((name) => (
                        <li key={name}>
                          <button
                            type="button"
                            disabled={!canEdit}
                            draggable={canEdit}
                            onDragStart={(e) =>
                              setDragPayload(e, { kind: "component", name })
                            }
                            onClick={() => insert(name)}
                            className="w-full cursor-grab rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {name}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
