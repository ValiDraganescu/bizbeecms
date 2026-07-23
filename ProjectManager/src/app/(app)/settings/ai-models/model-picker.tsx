"use client";

/**
 * Searchable OpenRouter model picker for the curation page — a port of the
 * CMS's `components/chat/model-picker.tsx` (same UX: search box, modality
 * filter chips, provider groups low→high price, in/out $ per 1M tokens), fed
 * the catalog by the parent form (one fetch for the whole page) instead of
 * fetching its own.
 *
 * `value` is the raw OpenRouter model id the curation stores; an id missing
 * from the catalog (retired model, filtered out) still shows verbatim on the
 * trigger so nothing silently changes what an alias points at.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import {
  catalogModalities,
  filterByModalities,
  filterByOutputModalities,
  filterCatalog,
  groupByProvider,
  pricePerMillion,
  type CatalogModel,
} from "@/lib/ai/model-catalog";

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
  models,
  requireModalities,
  requireOutputModalities,
  id,
}: {
  value: string;
  onChange: (id: string) => void;
  /** The full catalog, fetched once by the parent form. */
  models: ReadonlyArray<CatalogModel>;
  /** Pre-filter to models accepting EVERY listed input modality. */
  requireModalities?: string[];
  /** Pre-filter to models PRODUCING every listed output modality. */
  requireOutputModalities?: string[];
  /** Trigger element id, so a `FieldLabel htmlFor` can target the picker. */
  id?: string;
}) {
  const t = useTranslations("settings.aiModels.picker");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [modFilter, setModFilter] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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

  // Base catalog: pre-filtered to the purpose's required modalities, so search
  // + toggles only ever see eligible models.
  const baseCatalog = useMemo(() => {
    let c: ReadonlyArray<CatalogModel> = models;
    if (requireModalities && requireModalities.length > 0) {
      c = filterByModalities(c, requireModalities);
    }
    if (requireOutputModalities && requireOutputModalities.length > 0) {
      c = filterByOutputModalities(c, requireOutputModalities);
    }
    return c;
  }, [models, requireModalities, requireOutputModalities]);

  // Distinct modalities available → the toggle bar (text alone is every model's
  // default; a modality already forced by `requireModalities` isn't offered).
  const modalities = useMemo(
    () =>
      catalogModalities(baseCatalog).filter(
        (m) => m !== "text" && !(requireModalities ?? []).includes(m),
      ),
    [baseCatalog, requireModalities],
  );
  const filtered = useMemo(
    () => filterByModalities(filterCatalog(baseCatalog, query), modFilter),
    [baseCatalog, query, modFilter],
  );
  const groups = useMemo(() => groupByProvider(filtered), [filtered]);
  // Flat list of ids in display order, for keyboard nav across groups.
  const flat = useMemo(() => groups.flatMap((g) => g.models), [groups]);

  const selected = models.find((m) => m.id === value);
  const buttonLabel = selected ? selected.label : value;

  function choose(modelId: string) {
    onChange(modelId);
    setOpen(false);
    setQuery("");
  }

  function toggleMod(mod: string) {
    setActive(0);
    setModFilter((cur) =>
      cur.includes(mod) ? cur.filter((m) => m !== mod) : [...cur, mod],
    );
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
    <div ref={rootRef} className="relative min-w-0">
      <button
        type="button"
        id={id}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex min-h-10 w-full min-w-0 items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-left text-sm text-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-primary"
      >
        <span className={`truncate ${value ? "" : "text-foreground-muted"}`}>
          {value ? buttonLabel : t("placeholder")}
        </span>
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

      {/* At least as wide as the trigger, grows to fit long model names,
          capped so it never runs off-screen. */}
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 max-h-80 w-max min-w-full max-w-md overflow-hidden rounded-md border border-border bg-surface shadow-lg">
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
              placeholder={t("search")}
              aria-label={t("search")}
              className="w-full rounded border border-border bg-background px-2 py-1 text-sm text-foreground"
            />
            {modalities.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1" role="group" aria-label={t("modalityFilter")}>
                {modalities.map((mod) => {
                  const on = modFilter.includes(mod);
                  const label = t(`modality${mod.charAt(0).toUpperCase()}${mod.slice(1)}`);
                  return (
                    <button
                      key={mod}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleMod(mod)}
                      className={`flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${
                        on
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-foreground-muted hover:bg-surface-muted"
                      }`}
                    >
                      <ModalityIcon modality={mod} label={label} />
                      <span className="capitalize">{label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          <ul className="max-h-64 overflow-y-auto py-1" role="listbox">
            {flat.length === 0 ? (
              <li className="px-3 py-2 text-sm text-foreground-muted">{t("noResults")}</li>
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
                            className={`flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm ${
                              idx === active ? "bg-primary/10" : ""
                            } ${m.id === value ? "font-semibold text-primary" : "text-foreground"}`}
                          >
                            <span className="flex min-w-0 flex-col">
                              <span className="truncate">{m.label}</span>
                              <span className="truncate font-mono text-[10px] text-foreground-muted">
                                {m.id}
                              </span>
                            </span>
                            {(() => {
                              const inP = pricePerMillion(m.inputPrice);
                              const outP = pricePerMillion(m.outputPrice);
                              if (inP == null && outP == null) return null;
                              return (
                                <span
                                  className="shrink-0 text-[10px] tabular-nums text-foreground-muted"
                                  title={t("priceTitle")}
                                >
                                  {inP != null && `${t("priceIn")} $${inP}`}
                                  {inP != null && outP != null && " / "}
                                  {outP != null && `${t("priceOut")} $${outP}`}
                                  {" "}
                                  {t("pricePerMillion")}
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
