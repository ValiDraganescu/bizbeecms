"use client";

/**
 * Translation model picker (AI content translation). Talks to
 * `GET/PATCH /api/settings/translate-model`. Offers the PM-curated `translate`
 * aliases (`AliasPicker`), degrading to the free catalog picker on an uncurated
 * site. The chosen model is what /api/translate uses to render page/component
 * text into the Site's other locales.
 *
 * REST-only (no server actions). next-intl copy. Saves on selection (pick =
 * persist), mirroring the image-model manager.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AliasPicker } from "@/components/settings/alias-picker";
import { DEFAULT_TRANSLATE_MODEL } from "@/lib/chat/models";

export function TranslateModelManager() {
  const t = useTranslations("translateModel");
  const [model, setModel] = useState<string>(DEFAULT_TRANSLATE_MODEL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/settings/translate-model")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((c) => {
        if (live) setModel((c as { model: string }).model);
      })
      .catch((e) => live && setError((e as Error).message))
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, []);

  async function choose(id: string) {
    setModel(id); // optimistic
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings/translate-model", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: id }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const c = (await res.json()) as { model: string };
      setModel(c.model); // server is the source of truth (resolves unknowns)
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    }
  }

  if (loading) return <p className="text-foreground-muted">{t("loading")}</p>;

  return (
    <div className="flex flex-col gap-3">
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
          {error}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-foreground">{t("label")}</span>
        <AliasPicker
          value={model}
          onChange={(id) => void choose(id)}
          purpose="translate"
          direction="down"
        />
        <span className="text-xs text-foreground-muted">{t("hint")}</span>
      </div>
      {saved && <span className="text-sm text-success">{t("saved")}</span>}
    </div>
  );
}
