"use client";

/**
 * CMS per-Site brand/design/AI-persona editor (Milestone 2, epic E2). One text
 * field per identity attribute; the values feed the AI chat system prompt so
 * generated components/pages match the Site's identity. GETs / PUTs
 * `/api/settings/brand`. The server re-normalizes (trim + length bound), so the
 * validation source of truth stays `lib/settings/site-settings.ts`.
 *
 * REST-only (no server actions). All copy via next-intl (EN/FI/ET). Styling uses
 * the purpose-token Tailwind utilities — never raw colors.
 *
 * ponytail: optimistic local edit then one PUT; no form lib. Field list is
 * data-driven off SITE_IDENTITY_FIELDS so adding a field needs no markup change.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  SITE_IDENTITY_FIELDS,
  type SiteIdentity,
} from "@/lib/settings/site-settings";

// Brand name + tagline are single-line; voice/design/persona are multi-line.
const MULTILINE = new Set<keyof SiteIdentity>(["voice", "design", "aiPersona"]);

export function BrandEditor({ initial }: { initial: SiteIdentity }) {
  const t = useTranslations("brand");
  const [identity, setIdentity] = useState<SiteIdentity>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function setField(field: keyof SiteIdentity, value: string) {
    setSaved(false);
    setError(null);
    setIdentity((prev) => ({ ...prev, [field]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/brand", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(identity),
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
      // The server trims/clamps — adopt its normalized truth.
      setIdentity((await res.json()) as SiteIdentity);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <ul className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-4">
        {SITE_IDENTITY_FIELDS.map((field) => (
          <li key={field} className="flex flex-col gap-1.5">
            <label
              htmlFor={`field-${field}`}
              className="text-sm font-medium text-foreground"
            >
              {t(`label.${field}`)}
            </label>
            {MULTILINE.has(field) ? (
              <textarea
                id={`field-${field}`}
                rows={field === "aiPersona" ? 4 : 2}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                placeholder={t(`placeholder.${field}`)}
                value={identity[field]}
                onChange={(e) => setField(field, e.target.value)}
              />
            ) : (
              <input
                id={`field-${field}`}
                type="text"
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground"
                placeholder={t(`placeholder.${field}`)}
                value={identity[field]}
                onChange={(e) => setField(field, e.target.value)}
              />
            )}
            <p className="text-xs text-foreground-muted">{t(`hint.${field}`)}</p>
          </li>
        ))}
      </ul>

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
