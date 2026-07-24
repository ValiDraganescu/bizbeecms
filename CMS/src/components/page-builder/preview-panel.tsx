"use client";

/**
 * The page builder's center PREVIEW pane, extracted from
 * page-builder-shell.tsx: URL bar (refresh + theme toggle), the responsive
 * frame, and the same-origin iframe with the click-to-select overlay. Owns the
 * iframe ref, the (re)load counter the overlay wiring keys off, and the
 * block-id → label map for the hover badge. Stays MOUNTED while hidden (the
 * `hidden` class) so the iframe survives tab switches.
 *
 * The shell keeps the preview nonce/theme/version STATE — the nonce is bumped
 * by saves and AI mutations, the theme also feeds the components rail, and the
 * version id belongs to the Page tab's version history.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { PageOption } from "@/lib/pages/page-picker";
import { isSection, isSectionColumn, listSections, sectionName } from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";
import type { Viewport } from "@/lib/page-builder/types";
import { wirePreviewOverlay, markSelectedInPreview } from "@/lib/page-builder/preview-overlay";
import { PreviewThemeIcon, ICON } from "./shared";

export type PreviewTheme = "system" | "light" | "dark";

// Preview frame widths per viewport (desktop = full width). See layout doc.
const VIEWPORT_WIDTH: Record<Viewport, string> = {
  desktop: "100%",
  tablet: "768px",
  mobile: "375px",
};

/**
 * Build the preview-iframe URL: `/preview/<id>` with optional `?theme=` (forced
 * color mode) and `?version=` (Versioning slice 4 — render a past version
 * read-only). "system" theme sends no theme param (inherits OS).
 */
function previewSrc(id: string, theme: PreviewTheme, versionId: string | null): string {
  const params = new URLSearchParams();
  if (theme !== "system") params.set("theme", theme);
  if (versionId) params.set("version", versionId);
  const qs = params.toString();
  return qs ? `/preview/${id}?${qs}` : `/preview/${id}`;
}

export function PreviewPanel({
  hidden,
  selected,
  viewport,
  blocks,
  selectedBlockId,
  theme,
  onThemeChange,
  previewNonce,
  onRefresh,
  versionId,
  onSelectBlock,
}: {
  /** True while the Layers tab is active — panel stays mounted, display:none. */
  hidden: boolean;
  selected: PageOption | null;
  viewport: Viewport;
  /** The draft tree — only read to label the overlay's hover badge. */
  blocks: Block[];
  selectedBlockId: string | null;
  theme: PreviewTheme;
  onThemeChange: (theme: PreviewTheme) => void;
  /** Bumped by the shell (save / AI mutation / refresh) to reload the iframe. */
  previewNonce: number;
  onRefresh: () => void;
  /** Versioning slice 4: render this past version read-only (null = live draft). */
  versionId: string | null;
  /** An overlay click reports a block id → select it AND show its Block tab. */
  onSelectBlock: (id: string) => void;
}) {
  const t = useTranslations("pageBuilder");
  // Preview iframe (same-origin) — the selection overlay reaches into its DOM to
  // outline blocks + report click-to-select. Bumped on every (re)load so the
  // wiring effect re-attaches to the fresh document.
  const previewRef = useRef<HTMLIFrameElement>(null);
  const [previewLoaded, setPreviewLoaded] = useState(0);

  // Names for the Preview hover label: section id → its display name, component
  // leaf id → its component name. Only the blocks the overlay OUTLINES need an
  // entry (sections + component leaves; rows/columns aren't outlined). Rebuilt
  // when the tree changes.
  const previewLabels = useMemo(() => {
    const map = new Map<string, string>();
    listSections(blocks).forEach((s, i) => map.set(s.id, sectionName(s.block, i)));
    const walk = (list: Block[]) => {
      for (const b of list) {
        // A component leaf (not a Section/row/column/List primitive) is outlined
        // as `data-block-wrap` → label it by its component name.
        if (!isSection(b) && !isSectionColumn(b) && b.component) {
          if (b.component !== "__section_row__") map.set(b.id, b.component);
        }
        if (b.children) walk(b.children);
      }
    };
    walk(blocks);
    return map;
  }, [blocks]);

  // Click-to-select inside the Preview iframe: wire the overlay on each iframe
  // load; a click reports a block id → onSelectBlock (same as a Layers click).
  // Re-runs when the iframe reloads (previewLoaded).
  useEffect(() => {
    if (hidden) return;
    return wirePreviewOverlay(
      previewRef.current,
      onSelectBlock,
      (id) => previewLabels.get(id) ?? null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewLoaded, hidden, previewLabels]);

  // Keep the iframe's selected outline in sync with the editor selection (from a
  // Preview click OR a Layers click), and after each (re)load.
  useEffect(() => {
    if (hidden) return;
    markSelectedInPreview(previewRef.current, selectedBlockId);
  }, [selectedBlockId, previewLoaded, hidden]);

  return (
    <div className={"absolute inset-0 flex flex-col " + (hidden ? "hidden" : "")}>
      {/* URL bar + refresh */}
      <div className="flex h-9 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <button
          type="button"
          disabled={!selected}
          onClick={onRefresh}
          title={t("refresh")}
          aria-label={t("refresh")}
          className="rounded p-1 text-foreground-muted disabled:opacity-50"
        >
          <svg {...ICON} width={14} height={14}>
            <path d="M23 4v6h-6" />
            <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
          </svg>
        </button>
        <div className="flex-1 truncate rounded border border-border bg-surface-muted px-2 py-1 text-xs text-foreground-muted">
          {selected ? selected.path : t("previewUrlPlaceholder")}
        </div>
        {/* Light / system / dark toggle — forces the iframe's color mode
            so the operator can SEE dark without changing their OS. */}
        <div className="flex shrink-0 items-center gap-0.5 rounded border border-border bg-surface-muted p-0.5">
          {(["light", "system", "dark"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onThemeChange(mode)}
              aria-pressed={theme === mode}
              title={t(`previewTheme.${mode}`)}
              aria-label={t(`previewTheme.${mode}`)}
              className={
                "rounded px-1.5 py-0.5 " +
                (theme === mode
                  ? "bg-surface text-foreground shadow-sm"
                  : "text-foreground-muted hover:text-foreground")
              }
            >
              <PreviewThemeIcon kind={mode} />
            </button>
          ))}
        </div>
      </div>
      {/* Responsive frame area — draft preview reuses the REAL renderer
          via /preview/<id> (any publish status), so it's true-to-site. */}
      <div className="flex flex-1 justify-center overflow-auto p-4">
        <div
          className="h-full overflow-hidden rounded-md border border-border bg-surface shadow-sm"
          style={{ width: VIEWPORT_WIDTH[viewport], maxWidth: "100%" }}
        >
          {selected ? (
            <iframe
              ref={previewRef}
              onLoad={() => setPreviewLoaded((n) => n + 1)}
              key={`${selected.id}-${previewNonce}-${theme}-${versionId ?? ""}`}
              src={previewSrc(selected.id, theme, versionId)}
              title={t("previewIframeTitle")}
              className="h-full w-full border-0 bg-surface"
            />
          ) : (
            <div className="flex h-full items-center justify-center p-6">
              <p className="text-center text-sm text-foreground-muted">
                {t("previewEmpty")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
