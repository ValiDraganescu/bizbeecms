"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { setDragPayload } from "@/lib/page-builder/dnd";
import { filterGroups } from "@/lib/components/rail-filter";
import type { ComponentGroup } from "@/lib/components/grouped";

/** How long the cursor must rest on a component before its preview mounts (ms). */
const PREVIEW_HOVER_DELAY = 400;

/**
 * Left-rail Components panel: the LAYOUT primitives (Section, List) above the
 * real COMPONENTS source — kit groups from `GET /api/components/grouped`, each an
 * expandable header (kit display name or the "individually-imported" bucket)
 * listing its component names, filtered live by the search box.
 *
 * Everything is DRAG-ONLY: the Section/List primitives and each component are
 * dragged into the canvas (the Layers panel / a Section column). Clicking does
 * nothing — drag-and-drop is the single, explicit way to place a block, so a
 * stray click can't dump a component into the wrong section.
 *
 * Hovering a component (after a short delay) mounts a floating PREVIEW: a live
 * iframe of `/preview/component/<name>` (the same pixel-true renderer the Develop
 * page uses), so the operator sees the real thing before dragging. Realtime,
 * nothing stored — only the hovered component renders, one at a time.
 *
 * ponytail: groups expanded by default (small lists); collapse state is local
 * useState keyed by group label. Preview is a plain iframe + a setTimeout delay.
 */
export function ComponentsRail({
  groups,
  groupBy,
  onGroupByChange,
  search,
  canEdit,
  previewTheme,
}: {
  groups: ComponentGroup[];
  groupBy: "kit" | "tag";
  onGroupByChange: (g: "kit" | "tag") => void;
  search: string;
  canEdit: boolean;
  // Forces the preview iframe's color mode to match the canvas preview toggle.
  previewTheme: "system" | "light" | "dark";
}) {
  const t = useTranslations("pageBuilder");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  // The component whose preview is showing + where to anchor the floating panel.
  const [preview, setPreview] = useState<{ name: string; top: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function openPreviewSoon(name: string, anchor: HTMLElement) {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    const top = anchor.getBoundingClientRect().top;
    hoverTimer.current = setTimeout(() => setPreview({ name, top }), PREVIEW_HOVER_DELAY);
  }
  function closePreview() {
    if (hoverTimer.current) clearTimeout(hoverTimer.current);
    hoverTimer.current = null;
    setPreview(null);
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

  // Drag-only primitive/component button. `disabled` greys it out before a page
  // is selected; there is intentionally no onClick.
  const dragBtn =
    "w-full cursor-grab rounded-md border border-border bg-surface px-3 py-2 text-left text-sm text-foreground hover:bg-surface-muted active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className="flex-1 space-y-4 overflow-y-auto p-3">
      {/* LAYOUT — the Section + List primitives (drag onto the Layers panel). */}
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
              className={dragBtn}
            >
              {t("layoutSection")}
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={!canEdit}
              draggable={canEdit}
              onDragStart={(e) => setDragPayload(e, { kind: "list" })}
              className={dragBtn}
            >
              {t("layoutList")}
            </button>
          </li>
          <li>
            <button
              type="button"
              disabled={!canEdit}
              draggable={canEdit}
              onDragStart={(e) => setDragPayload(e, { kind: "form" })}
              className={dragBtn}
            >
              {t("layoutForm")}
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
                            onDragStart={(e) => {
                              closePreview();
                              setDragPayload(e, { kind: "component", name });
                            }}
                            onMouseEnter={(e) => openPreviewSoon(name, e.currentTarget)}
                            onMouseLeave={closePreview}
                            className={dragBtn}
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

      {preview && (
        <ComponentPreview name={preview.name} top={preview.top} theme={previewTheme} />
      )}
    </div>
  );
}

// Preview panel geometry. The iframe renders at a real DESKTOP width so layout
// matches the live site; we then MEASURE the actual rendered content and scale to
// fit, so a small element (Badge) shows near life-size instead of being lost in a
// huge empty canvas, while a full-width Hero scales down to fit the panel.
const PREVIEW_PANEL_W = 480; // on-screen panel width (px)
const PREVIEW_DESKTOP_W = 1280; // width the component actually renders at
const PREVIEW_MAX_H = 320; // tallest the scaled content area may get
const PREVIEW_MAX_SCALE = 1; // never enlarge past life-size

/**
 * Floating live preview of one component, anchored to the right of the rail at the
 * hovered item's vertical position. `position: fixed` so it escapes the rail's
 * `overflow-y-auto` clipping. The iframe renders `/preview/component/<name>` (the
 * real renderer, isolated CSS + client script) at desktop width; once loaded we
 * measure the content box and fit the panel to it — realtime, nothing stored.
 */
function ComponentPreview({
  name,
  top,
  theme,
}: {
  name: string;
  top: number;
  theme: "system" | "light" | "dark";
}) {
  const t = useTranslations("pageBuilder");
  // `r` cache-busts per mount: hover previews render the current DRAFT, and a
  // pre-fix release stamped year-long Cache-Control on version-less preview
  // URLs — those browser-cache entries linger until the URL changes.
  const nonceRef = useRef(Date.now());
  const qs = `?r=${nonceRef.current}${theme === "system" ? "" : `&theme=${theme}`}`;
  const iframeRef = useRef<HTMLIFrameElement>(null);
  // Measured natural content size of the rendered component (desktop px).
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  // Measure the rendered content once the same-origin iframe loads. Reset on name
  // change so we don't show the previous component's box for the new one.
  useEffect(() => {
    setSize(null);
  }, [name, theme]);

  function measure() {
    const doc = iframeRef.current?.contentDocument;
    const body = doc?.body;
    if (!body) return;
    // The component renders straight into <body> (no wrapper). Measure the union
    // bounding box of its children: a Badge's box is tight (inline-block), a Hero's
    // spans the full desktop width — so each fits to its real visible size.
    const kids = Array.from(body.children) as HTMLElement[];
    let w = 0;
    let h = 0;
    for (const el of kids) {
      const r = el.getBoundingClientRect();
      w = Math.max(w, Math.ceil(r.right));
      h = Math.max(h, Math.ceil(r.bottom));
    }
    if (w < 1 || h < 1) return; // nothing painted yet
    setSize({ w: Math.min(w, PREVIEW_DESKTOP_W), h });
  }

  // Inner padding around the scaled component so it isn't jammed to the edge.
  const PAD = 12;
  const availW = PREVIEW_PANEL_W - PAD * 2;
  const availH = PREVIEW_MAX_H - PAD * 2;
  // Scale to fit BOTH the available width and height; never enlarge.
  const scale = size
    ? Math.min(availW / size.w, availH / size.h, PREVIEW_MAX_SCALE)
    : availW / PREVIEW_DESKTOP_W;
  const contentH = size ? Math.min(Math.ceil(size.h * scale), availH) : availH;

  // Clamp the panel into the viewport: never above 8px, never off the bottom.
  // Panel height = header + padding (both sides) + scaled content.
  const headerH = 28;
  const panelH = headerH + PAD * 2 + contentH;
  const clampedTop = Math.max(8, Math.min(top, window.innerHeight - panelH - 8));
  return (
    <div
      // Left edge sits just past the 260px rail (+ its border); pointer-events
      // off so the panel never steals the hover that's keeping it open.
      style={{ position: "fixed", left: 268, top: clampedTop, width: PREVIEW_PANEL_W, pointerEvents: "none" }}
      className="z-40 overflow-hidden rounded-lg border border-border bg-surface shadow-lg"
      role="tooltip"
      aria-label={t("componentPreviewLabel", { name })}
    >
      <div className="border-b border-border bg-surface-muted px-3 py-1.5 font-mono text-[11px] text-foreground-muted">
        {name}
      </div>
      {/* Content area sized to the scaled content; the oversized iframe is scaled
          into it from the top-left so a small element isn't lost in empty space.
          Inner padding gives small components breathing room from the panel edge. */}
      <div style={{ padding: PAD, width: PREVIEW_PANEL_W, overflow: "hidden" }}>
        <div style={{ width: availW, height: contentH, overflow: "hidden" }}>
        <iframe
          ref={iframeRef}
          src={`/preview/component/${encodeURIComponent(name)}${qs}`}
          title={t("componentPreviewLabel", { name })}
          scrolling="no"
          onLoad={measure}
          style={{
            width: size ? size.w : PREVIEW_DESKTOP_W,
            height: size ? size.h : Math.round(availH / (availW / PREVIEW_DESKTOP_W)),
            border: 0,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            backgroundColor: "var(--color-surface)",
          }}
        />
        </div>
      </div>
    </div>
  );
}
