/**
 * In-house searchable model picker (ai-assistant goal — model picker over the
 * full Workers-AI catalog). Replaces the plain `<select>` in the chat widget.
 *
 * Loads the catalog from `GET /api/chat/models` (cached + lazily refreshed in
 * D1), groups by PROVIDER (the `@cf/<vendor>/...` segment), orders each group
 * LOW→HIGH price, and supports a SEARCH/filter box + keyboard nav. No dropdown/
 * combobox dependency — a button + an absolutely-positioned panel, design-system
 * tokens. Falls back to the static `CHAT_MODELS` if the fetch fails so it's
 * never empty.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CHAT_MODELS,
  filterCatalog,
  groupByProvider,
  pricePerMillion,
  type CatalogModel,
} from "@/lib/chat/models";
import { coerceCatalog } from "@/lib/chat/catalog-coerce";

/** Minimal inline glyph per input modality (design-system stroke icons). */
function ModalityIcon({ modality, label }: { modality: string; label: string }) {
  const common = {
    width: 12,
    height: 12,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-label": label,
    role: "img" as const,
    className: "shrink-0",
  };
  switch (modality) {
    case "image":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6" />
        </svg>
      );
    case "audio":
      return (
        <svg {...common}>
          <path d="M3 10v4h4l5 5V5L7 10z" />
          <path d="M16 8a5 5 0 0 1 0 8" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="2" y="5" width="14" height="14" rx="2" />
          <path d="M22 8l-6 4 6 4z" />
        </svg>
      );
    default: // text
      return (
        <svg {...common}>
          <path d="M4 7V5h16v2" />
          <path d="M12 5v14" />
          <path d="M9 19h6" />
        </svg>
      );
  }
}

export function ModelPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (id: string) => void;
}) {
  const t = useTranslations("chat.widget");
  const [catalog, setCatalog] = useState<ReadonlyArray<CatalogModel>>(CHAT_MODELS);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load the catalog once on mount; keep the static fallback on failure.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/chat/models");
        if (!res.ok) return;
        const j = (await res.json()) as { models?: unknown };
        // Coerce the wire shape: a D1-CACHED payload may come from an older
        // bundle missing fields the renderer reads (e.g. inputModalities) →
        // BUG [P1] `.map` of undefined. Backfill so every entry is render-safe.
        const models = coerceCatalog(j.models);
        if (!cancelled && models.length > 0) {
          setCatalog(models);
        }
      } catch {
        /* offline / no binding — keep the static fallback */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Focus the search box when opened.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const filtered = useMemo(() => filterCatalog(catalog, query), [catalog, query]);
  const groups = useMemo(() => groupByProvider(filtered), [filtered]);
  // Flat list of ids in display order, for keyboard nav across groups.
  const flat = useMemo(() => groups.flatMap((g) => g.models), [groups]);

  const selected = catalog.find((m) => m.id === value);
  const buttonLabel = selected ? selected.label : value;

  function choose(id: string) {
    onChange(id);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, flat.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const m = flat[active];
      if (m) choose(m.id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-surface px-2 py-1 text-left text-foreground"
      >
        <span className="truncate">{buttonLabel}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="shrink-0"
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-1 max-h-72 w-72 max-w-[90vw] overflow-hidden rounded-md border border-border bg-surface shadow-lg">
          <div className="border-b border-border p-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onKeyDown}
              placeholder={t("modelSearch")}
              aria-label={t("modelSearch")}
              className="w-full rounded border border-border bg-background px-2 py-1 text-foreground"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1" role="listbox">
            {flat.length === 0 ? (
              <li className="px-3 py-2 text-foreground-muted">{t("modelNoResults")}</li>
            ) : (
              groups.map((g) => (
                <li key={g.provider}>
                  <div className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-foreground-muted">
                    {g.provider}
                  </div>
                  <ul>
                    {g.models.map((m) => {
                      const idx = flat.indexOf(m);
                      return (
                        <li key={m.id}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={m.id === value}
                            onClick={() => choose(m.id)}
                            onMouseEnter={() => setActive(idx)}
                            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left ${
                              idx === active ? "bg-primary/10" : ""
                            } ${m.id === value ? "font-semibold text-primary" : "text-foreground"}`}
                          >
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span className="truncate">{m.label}</span>
                              <span className="flex shrink-0 items-center gap-0.5 text-foreground-muted">
                                {(m.inputModalities ?? ["text"]).map((mod) => (
                                  <ModalityIcon
                                    key={mod}
                                    modality={mod}
                                    label={t(`modality${mod.charAt(0).toUpperCase()}${mod.slice(1)}`)}
                                  />
                                ))}
                              </span>
                            </span>
                            {(() => {
                              const inP = pricePerMillion(m.inputPrice);
                              const outP = pricePerMillion(m.outputPrice);
                              if (inP == null && outP == null) return null;
                              return (
                                <span
                                  className="shrink-0 text-[10px] tabular-nums text-foreground-muted"
                                  title={t("modelPriceTitle")}
                                >
                                  {inP != null && `${t("modelPriceIn")} $${inP}`}
                                  {inP != null && outP != null && " / "}
                                  {outP != null && `${t("modelPriceOut")} $${outP}`}
                                  {" "}
                                  {t("modelPricePerMillion")}
                                </span>
                              );
                            })()}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
