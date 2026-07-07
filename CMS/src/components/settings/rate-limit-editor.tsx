"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import type { RateLimitPreset } from "@/lib/render/rate-limit-config";
import { RATE_LIMIT_PRESETS } from "@/lib/render/rate-limit-config";

/**
 * Naughty-robot rate-limit threshold picker (seo-robots track 2/2). A radio group
 * over the three presets (off / normal / strict); saving PUTs the chosen preset to
 * `/api/settings/rate-limit`. The worker enforces it on the deployed Site after a
 * release + within a ≤30s in-isolate cache window (noted in the description).
 *
 * ponytail: radio + Save, no live counter/preview — the preset is a coarse knob.
 */
export function RateLimitEditor({ initial }: { initial: RateLimitPreset }) {
  const t = useTranslations("rateLimit");
  const [preset, setPreset] = useState<RateLimitPreset>(initial);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/rate-limit", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ preset }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { preset: RateLimitPreset };
      setPreset(j.preset);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-xs font-medium uppercase tracking-wide text-foreground-muted">
          {t("legend")}
        </legend>
        {RATE_LIMIT_PRESETS.map((p) => (
          <label
            key={p}
            className={
              "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors " +
              (preset === p
                ? "border-primary bg-primary-subtle"
                : "border-border hover:bg-surface-muted")
            }
          >
            <input
              type="radio"
              name="rate-limit-preset"
              value={p}
              checked={preset === p}
              onChange={() => {
                setPreset(p);
                setSaved(false);
              }}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="text-sm font-medium text-foreground">
                {t(`preset.${p}.label`)}
              </span>
              <span className="text-xs text-foreground-muted">
                {t(`preset.${p}.help`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="self-start rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary-hover disabled:opacity-50"
        >
          {busy ? t("saving") : t("save")}
        </button>
        {saved && <span className="text-xs text-success">{t("saved")}</span>}
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>

      <p className="text-xs text-foreground-muted">{t("note")}</p>
    </div>
  );
}
