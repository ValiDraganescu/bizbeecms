"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Inline icon field (icon-sets epic) — stores a single icon NAME from the Site's
 * selected icon set. Mirrors `ImagePicker`, but instead of the media gallery it
 * opens a SEARCHABLE GLYPH GRID backed by `GET /api/icons/search` (which searches
 * the active set and returns each match's normalized inline SVG). Picking a glyph
 * stores its bare name (e.g. "calendar"); the component renders it via an
 * `{{icon "name"}}` / `{{icon prop}}` slot. Empty value = no icon.
 *
 * The SVG previews are server-normalized from trusted Iconify output (currentColor,
 * no script) — safe to inline via dangerouslySetInnerHTML for the picker preview.
 *
 * ponytail: self-contained popover + debounced fetch; no popover lib, no global
 * state. The current glyph is fetched once so the field shows the chosen icon even
 * before opening the grid.
 */
type Hit = { name: string; svg: string };

export function IconPicker({
  value,
  label,
  onChange,
}: {
  value: string;
  label?: string;
  onChange: (name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  // The currently-selected icon's SVG (for the closed-field preview).
  const [currentSvg, setCurrentSvg] = useState("");

  // Fetch the selected icon's glyph once (so the chip shows it without opening).
  useEffect(() => {
    if (!value) {
      setCurrentSvg("");
      return;
    }
    let alive = true;
    void fetch(`/api/icons/search?q=${encodeURIComponent(value)}&limit=24`)
      .then((r) => (r.ok ? r.json() : { icons: [] }))
      .then((d) => {
        if (!alive) return;
        const icons = ((d as { icons?: Hit[] }).icons ?? []);
        setCurrentSvg(icons.find((i) => i.name === value)?.svg ?? "");
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value]);

  // Debounced search while the grid is open.
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open) return;
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q === "") {
      setHits([]);
      return;
    }
    setLoading(true);
    debounce.current = setTimeout(() => {
      void fetch(`/api/icons/search?q=${encodeURIComponent(q)}&limit=60`)
        .then((r) => (r.ok ? r.json() : { icons: [] }))
        .then((d) => setHits((d as { icons?: Hit[] }).icons ?? []))
        .catch(() => setHits([]))
        .finally(() => setLoading(false));
    }, 250);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, open]);

  function pick(name: string, svg: string) {
    onChange(name);
    setCurrentSvg(svg);
    setOpen(false);
    setQuery("");
    setHits([]);
  }

  return (
    <div className="flex flex-col gap-2">
      {label && (
        <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">
          {label}
        </span>
      )}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={value || "Pick an icon"}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border text-foreground hover:border-primary [&>svg]:h-5 [&>svg]:w-5"
          // Normalized, trusted SVG from /api/icons/search (server-side Iconify).
          {...(currentSvg ? { dangerouslySetInnerHTML: { __html: currentSvg } } : {})}
        >
          {currentSvg ? null : <span className="text-base text-foreground-muted">+</span>}
        </button>
        {value ? (
          <>
            <span className="font-mono text-xs text-foreground">{value}</span>
            <button
              type="button"
              onClick={() => onChange("")}
              className="text-xs text-danger hover:underline"
            >
              Remove
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs text-foreground hover:bg-surface-muted"
          >
            Pick an icon
          </button>
        )}
      </div>

      {open && (
        <div className="rounded-md border border-border bg-surface-raised p-2 shadow-sm">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search icons…"
            className="w-full rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-foreground placeholder:text-foreground-muted"
          />
          <div className="mt-2 max-h-56 overflow-y-auto">
            {loading && hits.length === 0 ? (
              <p className="px-1 py-3 text-center text-xs text-foreground-muted">Searching…</p>
            ) : hits.length === 0 ? (
              <p className="px-1 py-3 text-center text-xs text-foreground-muted">
                {query.trim() ? "No icons found" : "Type to search the icon set"}
              </p>
            ) : (
              <div className="grid grid-cols-6 gap-1">
                {hits.map((h) => (
                  <button
                    key={h.name}
                    type="button"
                    title={h.name}
                    onClick={() => pick(h.name, h.svg)}
                    className={
                      "flex aspect-square items-center justify-center rounded-md border text-foreground hover:border-primary hover:bg-surface-muted [&>svg]:h-5 [&>svg]:w-5 " +
                      (h.name === value ? "border-primary bg-primary-subtle" : "border-transparent")
                    }
                    dangerouslySetInnerHTML={{ __html: h.svg }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
