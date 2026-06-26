"use client";

/**
 * CMS component export/import UI (Milestone 2, epic H1/H2). Lists components,
 * exports one as a portable JSON bundle (download), and imports a bundle pasted
 * into a textarea or uploaded as a `.json` file. The import is re-validated
 * server-side (`/api/components` POST is the trust boundary) — this is a
 * convenience surface, not the gate.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Purpose
 * Tailwind tokens only — never raw colors.
 *
 * ponytail: native <textarea> + <input type=file>, no upload lib. Browser
 * <a download> via a Blob URL for export, no file-saver dep.
 */

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { distinctTags, filterByTag, normalizeTags } from "@/lib/components/tags";

type ComponentSummary = {
  name: string;
  hasScript: boolean;
  hasCss: boolean;
  tags: string[];
};

// Preview shape returned by POST /api/components/preview (mirrors KitPreview in
// lib/components/portable.ts — kept local so this client file imports no server code).
type KitPreview = {
  name: string;
  tag: string;
  components: { name: string; tags: string[]; action: "create" | "update" }[];
  tags: string[];
  assets: string[];
  missingComponents: string[];
  errors: string[];
};

// Starter kits the UI offers. Keep in sync with the KITS registry in
// `api/components/kit/route.ts`; `labelKey` is the i18n key for the button.
const KITS = [
  { id: "blog", labelKey: "installBlogKit" },
  { id: "landing", labelKey: "installLandingKit" },
  { id: "docs", labelKey: "installDocsKit" },
  { id: "portfolio", labelKey: "installPortfolioKit" },
  { id: "pricing", labelKey: "installPricingKit" },
] as const;

export function ComponentsManager({
  initialComponents,
}: {
  initialComponents: ComponentSummary[];
}) {
  const t = useTranslations("components");
  const [components, setComponents] = useState<ComponentSummary[]>(initialComponents);
  const [paste, setPaste] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // H3: /media/<key> asset deps the just-imported bundle references — the target
  // Site must have these uploaded or the references dangle.
  const [assetDeps, setAssetDeps] = useState<string[]>([]);
  // H3b: nested-component refs the import/kit needs that aren't installed here.
  const [missingComponents, setMissingComponents] = useState<string[]>([]);
  // H3b part 1 — editable asset-rebind. After a paste/upload import, keep the
  // source bundle + this Site's media keys so we can offer a per-dep rebind
  // (keep / point at a /media key / drop) and re-import {text, rebind}. Kit
  // installs have no single re-importable bundle → they keep the read-only list.
  const [lastBundle, setLastBundle] = useState<string | null>(null);
  const [siteAssetKeys, setSiteAssetKeys] = useState<string[]>([]);
  // Per-dep choice: undefined/"" = keep, "__drop__" = remove, else a /media key.
  const [rebind, setRebind] = useState<Record<string, string>>({});
  // Slice 2: which tag the list is filtered by ("" = show all), and the per-row
  // "add tag" input text keyed by component name.
  const [tagFilter, setTagFilter] = useState("");
  const [tagDraft, setTagDraft] = useState<Record<string, string>>({});
  // Preview-before-install: a read-only summary of a pasted/uploaded kit bundle
  // (component names + create/update + tags + missing deps) shown BEFORE writing.
  const [kitPreview, setKitPreview] = useState<KitPreview | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const allTags = distinctTags(components);
  const visible = filterByTag(components, tagFilter);

  async function refresh() {
    const res = await fetch("/api/components");
    if (res.ok) setComponents((await res.json()) as ComponentSummary[]);
  }

  // Persist a component's tags via the tags-only PATCH (never touches the
  // artifact). Optimistic: update local state, then re-sync from the server's
  // canonical (normalized) tags.
  async function saveTags(name: string, tags: string[]) {
    setError(null);
    try {
      const res = await fetch("/api/components", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, tags }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const j = (await res.json()) as { name: string; tags: string[] };
      setComponents((cs) =>
        cs.map((c) => (c.name === j.name ? { ...c, tags: j.tags } : c)),
      );
    } catch (err) {
      setError((err as Error).message);
    }
  }

  function addTag(c: ComponentSummary) {
    const draft = (tagDraft[c.name] ?? "").trim();
    if (!draft) return;
    const next = normalizeTags([...c.tags, draft]);
    setTagDraft((d) => ({ ...d, [c.name]: "" }));
    void saveTags(c.name, next);
  }

  function removeTag(c: ComponentSummary, tag: string) {
    void saveTags(c.name, c.tags.filter((x) => x !== tag));
  }

  // Load this Site's media keys so a rebind can target a real asset (H3b p1).
  async function loadSiteAssetKeys() {
    try {
      const res = await fetch("/api/assets");
      if (res.ok) {
        const rows = (await res.json()) as { key: string }[];
        setSiteAssetKeys(rows.map((r) => r.key));
      }
    } catch {
      /* gallery fetch is best-effort; rebind UI still works minus targets */
    }
  }

  // Slice 3: export every component carrying `tag` as ONE *.kit.json bundle.
  // Reuses the same <a download> Blob pattern as exportOne.
  async function exportKit(tag: string) {
    setError(null);
    setNotice(null);
    if (!tag) return;
    try {
      const res = await fetch(`/api/components/export?tag=${encodeURIComponent(tag)}`);
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const text = await res.text();
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${tag.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "kit"}.kit.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function exportOne(name: string) {
    setError(null);
    setNotice(null);
    setAssetDeps([]);
    setMissingComponents([]);
    setLastBundle(null);
    try {
      const res = await fetch(`/api/components?name=${encodeURIComponent(name)}`);
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const text = await res.text();
      // Trigger a browser download of the bundle JSON.
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.component.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  // Preview-before-install: a kit bundle (text or upload) gets a read-only
  // summary (no D1 write) so the operator sees what's inside before committing.
  // Detect the kit envelope client-side; a non-kit bundle just imports directly.
  function isKitBundle(text: string): boolean {
    try {
      return (JSON.parse(text) as { format?: unknown }).format === "bizbeecms.kit";
    } catch {
      return false;
    }
  }

  async function previewKit(text: string) {
    setError(null);
    setNotice(null);
    setKitPreview(null);
    if (text.trim() === "") {
      setError(t("importEmpty"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/components/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      setKitPreview((await res.json()) as KitPreview);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // `rebindMap` (H3b p1): re-import the SAME bundle with a {oldKey: newKey|null}
  // map applied. The server route + pure validator already accept {rebind}.
  async function importBundle(text: string, rebindMap?: Record<string, string | null>) {
    setError(null);
    setNotice(null);
    setAssetDeps([]);
    setMissingComponents([]);
    setKitPreview(null);
    if (text.trim() === "") {
      setError(t("importEmpty"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rebindMap ? { text, rebind: rebindMap } : { text }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const j = (await res.json()) as {
        // Single-component import.
        action?: "created" | "updated";
        name?: string;
        // Kit import (Slice 4): many components in one step.
        kit?: string;
        created?: number;
        updated?: number;
        skipped?: string[];
        assets?: string[];
        missingComponents?: string[];
      };
      if (j.kit !== undefined) {
        // Kit bundle installed — report counts (+ any skipped components).
        setNotice(
          t("kitImported", {
            kit: j.kit,
            created: j.created ?? 0,
            updated: j.updated ?? 0,
          }) +
            ((j.skipped?.length ?? 0) > 0
              ? " " + t("kitSkipped", { count: j.skipped!.length })
              : ""),
        );
        setLastBundle(null); // a kit has no single re-importable bundle
      } else {
        setNotice(
          j.action === "created"
            ? t("imported", { name: j.name ?? "" })
            : t("updated", { name: j.name ?? "" }),
        );
        // Keep the bundle source + reset rebind choices so the (possibly still
        // dangling) deps can be rebound and re-imported again.
        setLastBundle(text);
      }
      setAssetDeps(j.assets ?? []);
      setMissingComponents(j.missingComponents ?? []);
      setRebind({});
      void loadSiteAssetKeys();
      setPaste("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Build the rebind map from the per-dep choices and re-import the bundle.
  function applyRebind() {
    if (!lastBundle) return;
    const map: Record<string, string | null> = {};
    for (const [key, choice] of Object.entries(rebind)) {
      if (choice === "__drop__") map[key] = null;
      else if (choice) map[key] = choice;
    }
    void importBundle(lastBundle, map);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importBundle(text);
  }

  // Install a starter kit by id (epics G1/G2): one POST to the kit route, which
  // runs every premade bundle through the SAME import gate + write path.
  async function installKit(id: string) {
    setError(null);
    setNotice(null);
    setAssetDeps([]);
    setMissingComponents([]);
    setLastBundle(null); // kits have no single re-importable bundle → read-only deps
    setBusy(true);
    try {
      const res = await fetch("/api/components/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const j = (await res.json()) as {
        created: number;
        updated: number;
        assets?: string[];
        missingComponents?: string[];
      };
      setNotice(t("kitInstalled", { created: j.created, updated: j.updated }));
      setAssetDeps(j.assets ?? []);
      setMissingComponents(j.missingComponents ?? []);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-md border border-success bg-surface-raised px-3 py-2 text-success"
        >
          {notice}
        </p>
      )}
      {/* Editable rebind (H3b part 1): after a paste/upload import, let the
          admin keep / repoint / drop each referenced asset, then re-import. */}
      {assetDeps.length > 0 && lastBundle && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised px-3 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">{t("rebindTitle")}</span>
            <span className="text-sm text-foreground-muted">{t("rebindHint")}</span>
          </div>
          <ul className="flex flex-col gap-2">
            {assetDeps.map((k) => {
              const present = siteAssetKeys.includes(k);
              return (
                <li key={k} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-sm text-foreground">/media/{k}</span>
                    <span className={`text-xs ${present ? "text-success" : "text-danger"}`}>
                      {present ? t("rebindPresent") : t("rebindMissing")}
                    </span>
                  </div>
                  <select
                    className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
                    value={rebind[k] ?? ""}
                    disabled={busy}
                    aria-label={`/media/${k}`}
                    onChange={(e) => setRebind((r) => ({ ...r, [k]: e.target.value }))}
                  >
                    <option value="">{t("rebindKeep")}</option>
                    <option value="__drop__">{t("rebindDrop")}</option>
                    {siteAssetKeys.length > 0 && (
                      <optgroup label={t("rebindToLabel")}>
                        {siteAssetKeys.map((sk) => (
                          <option key={sk} value={sk}>
                            /media/{sk}
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => applyRebind()}
          >
            {busy ? t("applyingRebind") : t("applyRebind")}
          </button>
        </div>
      )}
      {/* Read-only deps list for kit installs / exports (no single bundle to re-import). */}
      {assetDeps.length > 0 && !lastBundle && (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-md border border-border bg-surface-raised px-3 py-2"
        >
          <span className="text-sm font-medium text-foreground">{t("assetDepsTitle")}</span>
          <span className="text-sm text-foreground-muted">{t("assetDepsHint")}</span>
          <ul className="mt-1 flex flex-col gap-0.5">
            {assetDeps.map((k) => (
              <li key={k} className="truncate font-mono text-sm text-foreground-muted">
                /media/{k}
              </li>
            ))}
          </ul>
        </div>
      )}
      {missingComponents.length > 0 && (
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-md border border-danger bg-danger-subtle px-3 py-2"
        >
          <span className="text-sm font-medium text-danger">{t("componentDepsTitle")}</span>
          <span className="text-sm text-danger">{t("componentDepsHint")}</span>
          <ul className="mt-1 flex flex-col gap-0.5">
            {missingComponents.map((n) => (
              <li key={n} className="truncate font-mono text-sm text-danger">
                {n}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Starter kits: one-click install of a premade component set (G1/G2).
          Each kit = one entry here; install goes through the gated kit route. */}
      <section className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4">
        <h2 className="text-lg font-semibold text-foreground">{t("kitsTitle")}</h2>
        <p className="text-sm text-foreground-muted">{t("kitsHint")}</p>
        <div className="flex flex-wrap gap-2">
          {KITS.map((k) => (
            <button
              key={k.id}
              type="button"
              className="self-start rounded-md border border-border px-4 py-2 text-foreground hover:bg-surface disabled:opacity-50"
              disabled={busy}
              onClick={() => void installKit(k.id)}
            >
              {t(k.labelKey)}
            </button>
          ))}
        </div>
      </section>

      {/* Component list with per-component export + tags (Slice 2) */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">{t("listTitle")}</h2>
          {allTags.length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-foreground-muted">
                {t("filterByTag")}
                <select
                  className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground"
                  value={tagFilter}
                  onChange={(e) => setTagFilter(e.target.value)}
                >
                  <option value="">{t("filterAllTags")}</option>
                  {allTags.map((tg) => (
                    <option key={tg} value={tg}>
                      {tg}
                    </option>
                  ))}
                </select>
              </label>
              {/* Slice 3: export the selected tag as a single UI-kit bundle. */}
              <button
                type="button"
                className="rounded-md border border-border px-3 py-1 text-sm text-foreground hover:bg-surface disabled:opacity-40"
                disabled={busy || !tagFilter}
                title={tagFilter ? undefined : t("exportKitPickTag")}
                onClick={() => void exportKit(tagFilter)}
              >
                {t("exportKit")}
              </button>
            </div>
          )}
        </div>
        {/* Shared autocomplete source for all per-component add-tag inputs. */}
        <datalist id="component-tags">
          {allTags.map((tg) => (
            <option key={tg} value={tg} />
          ))}
        </datalist>
        {components.length === 0 ? (
          <p className="text-foreground-muted">{t("empty")}</p>
        ) : visible.length === 0 ? (
          <p className="text-foreground-muted">{t("noneForTag")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((c) => (
              <li
                key={c.name}
                className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised px-3 py-2"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate font-mono text-foreground">{c.name}</span>
                    <span className="text-sm text-foreground-muted">
                      {[c.hasScript ? t("flagScript") : null, c.hasCss ? t("flagCss") : null]
                        .filter(Boolean)
                        .join(" · ") || t("flagStatic")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="shrink-0 rounded border border-border px-3 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40"
                    disabled={busy}
                    onClick={() => void exportOne(c.name)}
                  >
                    {t("export")}
                  </button>
                </div>
                {/* Tag chips + remove, and an add-tag input with autocomplete. */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {c.tags.map((tg) => (
                    <span
                      key={tg}
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-foreground"
                    >
                      {tg}
                      <button
                        type="button"
                        className="text-foreground-muted hover:text-danger disabled:opacity-40"
                        disabled={busy}
                        aria-label={t("removeTag", { tag: tg })}
                        onClick={() => removeTag(c, tg)}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  <input
                    list="component-tags"
                    className="w-32 rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-foreground"
                    placeholder={t("addTagPlaceholder")}
                    aria-label={t("addTagFor", { name: c.name })}
                    value={tagDraft[c.name] ?? ""}
                    disabled={busy}
                    onChange={(e) =>
                      setTagDraft((d) => ({ ...d, [c.name]: e.target.value }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addTag(c);
                      }
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Kit preview (preview-before-install): a read-only summary of a pasted
          kit bundle — what it would create/update + its tags + missing deps —
          with a Confirm install that runs the SAME gated import path. */}
      {kitPreview && (
        <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised px-3 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground">
              {t("previewTitle", { name: kitPreview.name })}
            </span>
            <span className="text-sm text-foreground-muted">
              {t("previewCount", { count: kitPreview.components.length })}
            </span>
          </div>
          <ul className="flex flex-col gap-1">
            {kitPreview.components.map((c) => (
              <li key={c.name} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm text-foreground">{c.name}</span>
                <span className="text-xs text-foreground-muted">
                  {c.action === "create" ? t("previewCreate") : t("previewUpdate")}
                </span>
                {c.tags.map((tg) => (
                  <span
                    key={tg}
                    className="rounded-full border border-border bg-surface px-2 py-0.5 text-xs text-foreground"
                  >
                    {tg}
                  </span>
                ))}
              </li>
            ))}
          </ul>
          {kitPreview.missingComponents.length > 0 && (
            <span className="text-sm text-danger">
              {t("previewMissingDeps", { deps: kitPreview.missingComponents.join(", ") })}
            </span>
          )}
          {kitPreview.assets.length > 0 && (
            <span className="text-sm text-foreground-muted">
              {t("previewAssets", { count: kitPreview.assets.length })}
            </span>
          )}
          {kitPreview.errors.length > 0 && (
            <span className="text-sm text-danger">
              {t("previewSkipped", { count: kitPreview.errors.length })}
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={busy}
              onClick={() => void importBundle(paste)}
            >
              {busy ? t("importing") : t("previewConfirm")}
            </button>
            <button
              type="button"
              className="self-start rounded-md border border-border px-4 py-2 text-foreground hover:bg-surface disabled:opacity-50"
              disabled={busy}
              onClick={() => setKitPreview(null)}
            >
              {t("previewCancel")}
            </button>
          </div>
        </div>
      )}

      {/* Import: paste or upload */}
      <section className="flex flex-col gap-3 border-t border-border pt-6">
        <h2 className="text-lg font-semibold text-foreground">{t("importTitle")}</h2>
        <p className="text-sm text-foreground-muted">{t("importHint")}</p>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground-muted">{t("uploadLabel")}</span>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="text-sm text-foreground file:mr-3 file:rounded file:border file:border-border file:bg-surface file:px-3 file:py-1 file:text-foreground"
            onChange={(e) => void onFile(e)}
            disabled={busy}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground-muted">{t("pasteLabel")}</span>
          <textarea
            className="h-40 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
            value={paste}
            onChange={(e) => {
              setPaste(e.target.value);
              setKitPreview(null);
            }}
            placeholder={t("pastePlaceholder")}
            disabled={busy}
            aria-label={t("pasteLabel")}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          {/* A kit bundle gets a Preview button; everything else imports directly. */}
          {isKitBundle(paste) && (
            <button
              type="button"
              className="self-start rounded-md border border-border px-4 py-2 text-foreground hover:bg-surface disabled:opacity-50"
              disabled={busy}
              onClick={() => void previewKit(paste)}
            >
              {t("previewKit")}
            </button>
          )}
          <button
            type="button"
            className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
            disabled={busy}
            onClick={() => void importBundle(paste)}
          >
            {busy ? t("importing") : t("import")}
          </button>
        </div>
      </section>
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
