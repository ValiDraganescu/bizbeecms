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

type ComponentSummary = { name: string; hasScript: boolean; hasCss: boolean };

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
  const fileRef = useRef<HTMLInputElement>(null);

  async function refresh() {
    const res = await fetch("/api/components");
    if (res.ok) setComponents((await res.json()) as ComponentSummary[]);
  }

  async function exportOne(name: string) {
    setError(null);
    setNotice(null);
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

  async function importBundle(text: string) {
    setError(null);
    setNotice(null);
    if (text.trim() === "") {
      setError(t("importEmpty"));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/components", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const j = (await res.json()) as { action: "created" | "updated"; name: string };
      setNotice(
        j.action === "created"
          ? t("imported", { name: j.name })
          : t("updated", { name: j.name }),
      );
      setPaste("");
      if (fileRef.current) fileRef.current.value = "";
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    await importBundle(text);
  }

  // Install the blog starter kit (epic G1): one POST to the kit route, which
  // runs every premade bundle through the SAME import gate + write path.
  async function installBlogKit() {
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const res = await fetch("/api/components/kit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: "blog" }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const j = (await res.json()) as { created: number; updated: number };
      setNotice(t("kitInstalled", { created: j.created, updated: j.updated }));
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

      {/* Starter kits: one-click install of a premade component set (G1) */}
      <section className="flex flex-col gap-2 rounded-md border border-border bg-surface-raised p-4">
        <h2 className="text-lg font-semibold text-foreground">{t("kitsTitle")}</h2>
        <p className="text-sm text-foreground-muted">{t("kitsHint")}</p>
        <button
          type="button"
          className="mt-1 self-start rounded-md border border-border px-4 py-2 text-foreground hover:bg-surface disabled:opacity-50"
          disabled={busy}
          onClick={() => void installBlogKit()}
        >
          {t("installBlogKit")}
        </button>
      </section>

      {/* Component list with per-component export */}
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-foreground">{t("listTitle")}</h2>
        {components.length === 0 ? (
          <p className="text-foreground-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {components.map((c) => (
              <li
                key={c.name}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
              >
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
              </li>
            ))}
          </ul>
        )}
      </section>

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
            onChange={(e) => setPaste(e.target.value)}
            placeholder={t("pastePlaceholder")}
            disabled={busy}
            aria-label={t("pasteLabel")}
          />
        </label>

        <button
          type="button"
          className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={busy}
          onClick={() => void importBundle(paste)}
        >
          {busy ? t("importing") : t("import")}
        </button>
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
