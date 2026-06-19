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
 * Per-block props: one field per DECLARED prop (the component's propsSchema), a
 * textarea for `richtext` else a text input. Localized props are stored as locale
 * objects (`{en,fi,…}`); with >1 site content locale every prop renders ONE field
 * PER locale and writes a `{loc:text}` object; single-locale sites keep one field
 * + a bare string (per-locale value/write logic is the pure page-blocks module).
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  addBlock,
  localeFieldValue,
  moveBlock,
  parsePropsSchema,
  removeBlock,
  setLocalizedProp,
  validateBlockProps,
} from "@/lib/pages/page-blocks";
import type { Block } from "@/lib/render/tree";

type PaletteEntry = { name: string; propsSchema: string | null };

export function BlockEditor({
  pageId,
  initialBlocks,
  palette,
  locales,
}: {
  pageId: string;
  initialBlocks: Block[];
  palette: PaletteEntry[];
  /** Site content locales (default first); >1 → per-locale prop fields. */
  locales: string[];
}) {
  const t = useTranslations("pageBlocks");
  const [blocks, setBlocks] = useState<Block[]>(initialBlocks);
  const [picked, setPicked] = useState<string>(palette[0]?.name ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const schemaOf = (component: string) =>
    parsePropsSchema(palette.find((p) => p.name === component)?.propsSchema);

  /**
   * Set one locale's text on a prop, mirroring the renderer's declared-prop
   * allowlist. With >1 content locale the stored value is a `{loc:text}` object;
   * single-locale sites store a bare string (the pure helper decides which).
   */
  function setProp(blockId: string, propName: string, locale: string, value: string) {
    mutate(
      blocks.map((b) => {
        if (b.id !== blockId) return b;
        const declared = new Set(schemaOf(b.component).map((f) => f.name));
        const current = (b.props ?? {})[propName as keyof typeof b.props];
        const props = validateBlockProps(
          { ...(b.props ?? {}), [propName]: setLocalizedProp(current, locale, value, locales) },
          declared,
        );
        const next = { ...b };
        if (Object.keys(props).length > 0) next.props = props;
        else delete next.props;
        return next;
      }),
    );
  }

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
              {palette.map((p) => (
                <option key={p.name} value={p.name}>
                  {p.name}
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
              className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
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
              </div>
              {(() => {
                const fields = schemaOf(b.component);
                if (fields.length === 0) return null;
                const props = (b.props ?? {}) as Record<string, unknown>;
                const multi = locales.length > 1;
                const defaultLocale = locales[0];
                return (
                  <div className="flex flex-col gap-3 border-t border-border pt-3">
                    {fields.map((f) => {
                      const raw = props[f.name];
                      return (
                        <fieldset key={f.name} className="flex flex-col gap-1">
                          <span className="text-sm text-foreground-muted">{f.name}</span>
                          {locales.map((loc) => {
                            const value = localeFieldValue(raw, loc, defaultLocale);
                            const fieldId = `${b.id}-${f.name}-${loc}`;
                            const ariaLabel = multi ? `${f.name} (${loc})` : f.name;
                            return (
                              <div key={loc} className="flex items-start gap-2">
                                {multi && (
                                  <span className="mt-2 w-10 shrink-0 font-mono text-xs uppercase text-foreground-muted">
                                    {loc}
                                  </span>
                                )}
                                {f.type === "richtext" ? (
                                  <textarea
                                    id={fieldId}
                                    className={`${input} min-h-20 flex-1`}
                                    value={value}
                                    placeholder={f.default}
                                    disabled={busy}
                                    aria-label={ariaLabel}
                                    onChange={(e) => setProp(b.id, f.name, loc, e.target.value)}
                                  />
                                ) : (
                                  <input
                                    id={fieldId}
                                    type="text"
                                    className={`${input} flex-1`}
                                    value={value}
                                    placeholder={f.default}
                                    disabled={busy}
                                    aria-label={ariaLabel}
                                    onChange={(e) => setProp(b.id, f.name, loc, e.target.value)}
                                  />
                                )}
                              </div>
                            );
                          })}
                        </fieldset>
                      );
                    })}
                  </div>
                );
              })()}
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
