"use client";

/**
 * CMS robots.txt settings UI (seo-robots goal, robots.txt track #2). Edits the
 * per-Site crawler rules that `app/robots.txt/route.ts` serves. GETs / PUTs
 * `/api/settings/robots`.
 *
 * Two modes, mirroring the builder (lib/render/robots-txt.ts):
 *   - Structured rule groups: per-user-agent allow/disallow path lists.
 *   - Free-text override (advanced): when non-blank it REPLACES the generated
 *     rules and is served verbatim. The `Sitemap:` pointer is auto-appended by
 *     the builder — the operator must NOT add one here.
 *
 * REST-only (no server actions). Copy via next-intl (EN/FI/ET), purpose-token
 * Tailwind utilities only.
 *
 * ponytail: optimistic local edit → one PUT; the server re-normalizes
 * (normalizeRobotsConfig) so validation truth stays server-side. Paths edited
 * as newline-joined textareas — one path per line, the shape robots.txt uses.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RobotsConfig, RobotsRuleGroup } from "@/lib/render/robots-txt";

/** Split a textarea into trimmed non-empty lines (one path per line). */
function toLines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

export function RobotsEditor({ initial }: { initial: RobotsConfig }) {
  const t = useTranslations("robots");
  const [groups, setGroups] = useState<RobotsRuleGroup[]>(initial.groups);
  const [freeText, setFreeText] = useState(initial.freeText);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const overrideActive = freeText.trim() !== "";

  function patchGroup(idx: number, patch: Partial<RobotsRuleGroup>) {
    setSaved(false);
    setGroups((gs) => gs.map((g, i) => (i === idx ? { ...g, ...patch } : g)));
  }

  function addGroup() {
    setSaved(false);
    setGroups((gs) => [...gs, { userAgent: "*", disallow: [], allow: [] }]);
  }

  function removeGroup(idx: number) {
    setSaved(false);
    setGroups((gs) => gs.filter((_, i) => i !== idx));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/robots", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ groups, freeText } satisfies RobotsConfig),
      });
      if (!res.ok) {
        let msg = `HTTP ${res.status}`;
        try {
          const j = (await res.json()) as { error?: string };
          if (j.error) msg = j.error;
        } catch {
          /* non-JSON body */
        }
        setError(msg);
        return;
      }
      // Server normalized (dropped bad paths/UAs, stripped injection) — adopt truth.
      const saved = (await res.json()) as RobotsConfig;
      setGroups(saved.groups);
      setFreeText(saved.freeText);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Structured rules */}
      <section
        className={
          "flex flex-col gap-4" + (overrideActive ? " opacity-50" : "")
        }
        aria-disabled={overrideActive}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-foreground">
            {t("rulesTitle")}
          </h2>
          {overrideActive && (
            <span className="text-sm text-foreground-muted">
              {t("overrideActive")}
            </span>
          )}
        </div>

        <ul className="flex flex-col gap-4">
          {groups.map((g, idx) => (
            <li
              key={idx}
              className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="text-sm text-foreground-muted">
                    {t("userAgent")}
                  </span>
                  <input
                    className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-foreground"
                    value={g.userAgent}
                    disabled={overrideActive}
                    onChange={(e) => patchGroup(idx, { userAgent: e.target.value })}
                    placeholder="*"
                    aria-label={t("userAgent")}
                  />
                </label>
                <button
                  type="button"
                  className="self-end rounded border border-border px-2 py-2 text-danger disabled:opacity-40"
                  disabled={overrideActive}
                  onClick={() => removeGroup(idx)}
                >
                  {t("removeGroup")}
                </button>
              </div>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground-muted">
                  {t("disallow")}
                </span>
                <textarea
                  className="min-h-20 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
                  value={g.disallow.join("\n")}
                  disabled={overrideActive}
                  onChange={(e) =>
                    patchGroup(idx, { disallow: toLines(e.target.value) })
                  }
                  placeholder={t("pathPlaceholder")}
                  aria-label={t("disallow")}
                />
              </label>

              <label className="flex flex-col gap-1">
                <span className="text-sm text-foreground-muted">{t("allow")}</span>
                <textarea
                  className="min-h-20 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
                  value={g.allow.join("\n")}
                  disabled={overrideActive}
                  onChange={(e) =>
                    patchGroup(idx, { allow: toLines(e.target.value) })
                  }
                  placeholder={t("pathPlaceholder")}
                  aria-label={t("allow")}
                />
              </label>
            </li>
          ))}
        </ul>

        <button
          type="button"
          className="self-start rounded-md border border-border px-4 py-2 text-foreground disabled:opacity-50"
          disabled={overrideActive}
          onClick={addGroup}
        >
          {t("addGroup")}
        </button>

        <p className="text-sm text-foreground-muted">{t("sitemapNote")}</p>
      </section>

      {/* Free-text override */}
      <section className="flex flex-col gap-2 border-t border-border pt-6">
        <h2 className="text-lg font-medium text-foreground">
          {t("overrideTitle")}
        </h2>
        <p className="text-sm text-foreground-muted">{t("overrideHelp")}</p>
        <textarea
          className="min-h-32 rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
          value={freeText}
          onChange={(e) => {
            setSaved(false);
            setFreeText(e.target.value);
          }}
          placeholder={t("overridePlaceholder")}
          aria-label={t("overrideTitle")}
        />
      </section>

      {error && (
        <p
          role="alert"
          className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger"
        >
          {error}
        </p>
      )}
      {saved && (
        <p
          role="status"
          className="rounded-md border border-success bg-success-subtle px-3 py-2 text-foreground"
        >
          {t("saved")}
        </p>
      )}

      <button
        type="button"
        className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        disabled={busy}
        onClick={() => void save()}
      >
        {busy ? t("saving") : t("save")}
      </button>
    </div>
  );
}
