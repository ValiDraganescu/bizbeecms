"use client";

/**
 * CMS search-engine verification settings UI (seo-robots goal). Edits the
 * per-Site Google / Bing / Yandex site-verification tokens that
 * `generateMetadata` emits as `<meta>` verification tags on every published
 * page. GETs / PUTs `/api/settings/verification`.
 *
 * The operator pastes the CONTENT value of the verification meta tag (not the
 * whole tag) — the server strips anything outside the token charset, so a
 * whole-tag paste still normalizes to just the token. REST-only, next-intl
 * copy (EN/FI/ET), purpose-token Tailwind only.
 *
 * ponytail: three text fields → one PUT; server re-normalizes so validation
 * truth stays server-side, and the editor adopts what got stored.
 */

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { SiteVerification } from "@/lib/render/site-verification";
import { VERIFICATION_FIELDS } from "@/lib/render/site-verification";

export function VerificationEditor({ initial }: { initial: SiteVerification }) {
  const t = useTranslations("verification");
  const [tokens, setTokens] = useState<SiteVerification>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function patch(field: keyof SiteVerification, value: string) {
    setSaved(false);
    setTokens((v) => ({ ...v, [field]: value }));
  }

  async function save() {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/verification", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(tokens satisfies SiteVerification),
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
      // Server normalized (stripped forbidden chars, length-bounded) — adopt truth.
      setTokens((await res.json()) as SiteVerification);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col gap-4">
        {VERIFICATION_FIELDS.map((field) => (
          <li key={field} className="flex flex-col gap-1">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium text-foreground">
                {t(`${field}.label`)}
              </span>
              <span className="text-sm text-foreground-muted">
                {t(`${field}.hint`)}
              </span>
              <input
                className="rounded-md border border-border bg-surface px-3 py-2 font-mono text-sm text-foreground"
                value={tokens[field]}
                onChange={(e) => patch(field, e.target.value)}
                placeholder={t(`${field}.placeholder`)}
                aria-label={t(`${field}.label`)}
                autoComplete="off"
                spellCheck={false}
              />
            </label>
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
