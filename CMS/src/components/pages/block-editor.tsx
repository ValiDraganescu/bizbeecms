"use client";

/**
 * CMS visual block editor (Milestone 2, epic C3) — the NON-AI compose/reorder of
 * a page's block tree, the missing half of C2 (page metadata). Lists the page's
 * current top-level blocks, adds a block from the component palette, removes one,
 * and reorders (up/down). Persists via PUT /api/pages/[id]/blocks → the
 * page-store's `setPageBlocks` contract (NOT upsertPageMeta).
 *
 * Edit logic is the PURE, node-tested `lib/pages/page-blocks` (add/remove/move) —
 * never duplicated here. REST-only (no server actions). All copy via next-intl
 * (EN/FI/ET). Purpose Tailwind tokens only.
 *
 * ponytail: top-level blocks only this slice; nested block.children authored by
 * the AI round-trip untouched but aren't edited here. Up/down reorder, no DnD lib.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addBlock, moveBlock, removeBlock } from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";

export function BlockEditor({
  pageId,
  initialBlocks,
  palette,
}: {
  pageId: string;
  initialBlocks: Block[];
  palette: string[];
}) {
  const t = useTranslations("pageBlocks");
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [picked, setPicked] = useState<string>(palette[0] ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function mutate(next: Block[]) {
    setBlocks(next);
    setSaved(false);
    setError(null);
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/pages/${encodeURIComponent(pageId)}/blocks`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "rounded-md border border-border bg-surface px-3 py-2 text-foreground";

  return (
    <div className="flex flex-col gap-4">
      {/* Palette: pick a component → add it as a block */}
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-surface-raised p-4">
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground-muted">{t("component")}</span>
          {palette.length === 0 ? (
            <span className="text-sm text-foreground-muted">{t("noComponents")}</span>
          ) : (
            <select
              className={input}
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              aria-label={t("component")}
            >
              {palette.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          )}
        </label>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={busy || !picked}
          onClick={() => mutate(addBlock(blocks, picked))}
        >
          {t("addBlock")}
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      {saved && !error && (
        <p className="rounded-md border border-success bg-surface-raised px-3 py-2 text-success">
          {t("saved")}
        </p>
      )}

      {blocks.length === 0 ? (
        <p className="text-foreground-muted">{t("empty")}</p>
      ) : (
        <ol className="flex flex-col gap-2">
          {blocks.map((b, i) => (
            <li
              key={b.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-mono text-foreground">{b.component}</span>
                <span className="truncate text-sm text-foreground-muted">{b.id}</span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-30"
                  disabled={busy || i === 0}
                  onClick={() => mutate(moveBlock(blocks, i, -1))}
                  aria-label={t("moveUp", { component: b.component })}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-30"
                  disabled={busy || i === blocks.length - 1}
                  onClick={() => mutate(moveBlock(blocks, i, 1))}
                  aria-label={t("moveDown", { component: b.component })}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-danger disabled:opacity-40"
                  disabled={busy}
                  onClick={() => mutate(removeBlock(blocks, b.id))}
                  aria-label={t("removeOne", { component: b.component })}
                >
                  {t("remove")}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={busy}
          onClick={() => void save()}
        >
          {busy ? t("saving") : t("save")}
        </button>
      </div>
    </div>
  );
}

async function errorOf(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* non-JSON body */
  }
  return `HTTP ${res.status}`;
}
