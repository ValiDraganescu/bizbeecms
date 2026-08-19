"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/components/ui";

export type SwitcherSite = { id: string; name: string };

/**
 * Breadcrumb entity switcher for the site detail header: `Sites / <name> ▾`.
 * "Sites" walks up to the list; the dropdown jumps directly to a sibling site
 * (context-switcher pattern — the page layout stays identical, only the
 * context changes). Plain links inside, so navigation semantics stay native.
 */
export function SiteSwitcher({
  sites,
  currentId,
  listLabel,
}: {
  sites: SwitcherSite[];
  currentId: string;
  listLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = sites.find((s) => s.id === currentId);

  // Close on click outside / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
      <Link
        href="/sites"
        className="rounded-md text-foreground-muted outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {listLabel}
      </Link>
      <span aria-hidden="true" className="text-foreground-muted/60">
        /
      </span>
      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          className="inline-flex items-center gap-1.5 rounded-md outline-none transition-colors hover:text-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          {current?.name}
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
            className="mt-0.5 text-foreground-muted"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
        {open ? (
          <div
            role="menu"
            className="absolute left-0 top-full z-10 mt-2 flex max-h-80 w-64 flex-col gap-0.5 overflow-y-auto rounded-md border border-border bg-surface-raised p-1 shadow-lg"
          >
            {sites.map((s) => (
              <Link
                key={s.id}
                role="menuitem"
                href={`/sites/${s.id}`}
                aria-current={s.id === currentId ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={cn(
                  "rounded px-3 py-2 text-sm outline-none transition-colors hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-ring",
                  s.id === currentId
                    ? "font-semibold text-primary"
                    : "font-medium text-foreground",
                )}
              >
                {s.name}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
