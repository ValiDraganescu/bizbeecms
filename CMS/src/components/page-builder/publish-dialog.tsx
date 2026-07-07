"use client";

/**
 * Publish-together dialog (component draft/publish epic).
 *
 * Opens when the page being published uses components with unpublished DRAFTS
 * (e.g. an AI edit): publishing only the page would leave the public render on
 * the components' stale LIVE artifacts. Lists each draft component with its
 * blast radius (the OTHER published pages a component publish re-renders, from
 * `GET /api/components/<name>/usage`) so the operator decides informed:
 * publish page + selected components, page only, or cancel.
 *
 * The AI never publishes — this dialog is deliberately the ONLY path that turns
 * an AI component draft live from the builder.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

type UsageRow = { pageId: string; slug: string; direct: boolean };

export function PublishDialog({
  componentNames,
  currentPageId,
  onConfirm,
  onCancel,
}: {
  componentNames: string[];
  currentPageId: string;
  /** Publish the checked components (possibly none), then the page. */
  onConfirm: (selected: string[]) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("pageBuilder.publishDialog");
  const [checked, setChecked] = useState<Set<string>>(() => new Set(componentNames));
  // name → other published pages it re-renders (null = still loading).
  const [usage, setUsage] = useState<Record<string, UsageRow[] | null>>({});

  useEffect(() => {
    let live = true;
    for (const name of componentNames) {
      void (async () => {
        const res = await fetch(`/api/components/${encodeURIComponent(name)}/usage`);
        const body = res.ok
          ? ((await res.json().catch(() => null)) as { usage?: UsageRow[] } | null)
          : null;
        if (live) setUsage((u) => ({ ...u, [name]: body?.usage ?? [] }));
      })();
    }
    return () => {
      live = false;
    };
  }, [componentNames]);

  function toggle(name: string) {
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("title")}
    >
      <div className="w-full max-w-md rounded-lg border border-border bg-surface p-4 shadow-lg">
        <h2 className="text-sm font-semibold text-foreground">{t("title")}</h2>
        <p className="mt-1 text-xs text-foreground-muted">{t("intro")}</p>
        <ul className="mt-3 flex max-h-64 flex-col gap-2 overflow-y-auto">
          {componentNames.map((name) => {
            const others = (usage[name] ?? []).filter((u) => u.pageId !== currentPageId);
            return (
              <li key={name} className="rounded-md border border-border p-2">
                <label className="flex cursor-pointer items-start gap-2">
                  <input
                    type="checkbox"
                    checked={checked.has(name)}
                    onChange={() => toggle(name)}
                    className="mt-0.5 accent-[var(--color-primary)]"
                  />
                  <span className="min-w-0">
                    <span className="font-mono text-sm text-foreground">{name}</span>
                    <span className="mt-0.5 block text-xs text-foreground-muted">
                      {usage[name] === undefined || usage[name] === null
                        ? t("usageLoading")
                        : others.length === 0
                          ? t("usageNone")
                          : t("usageOn", { count: others.length }) +
                            " " +
                            others.map((u) => u.slug || "/").join(", ")}
                    </span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm([])}
            className="rounded-md border border-border px-3 py-1.5 text-sm text-foreground hover:bg-surface-muted"
          >
            {t("pageOnly")}
          </button>
          <button
            type="button"
            onClick={() => onConfirm([...checked])}
            disabled={checked.size === 0}
            className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-60"
          >
            {t("publishBoth", { count: checked.size })}
          </button>
        </div>
      </div>
    </div>
  );
}
