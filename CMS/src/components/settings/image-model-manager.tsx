"use client";

/**
 * Image-description model picker (searchable media library). Talks to
 * `GET/PATCH /api/settings/image-model`. Offers the PM-curated `imageDescribe`
 * aliases (`AliasPicker`), degrading on an uncurated site to the chat's free
 * `ModelPicker` pre-filtered to image-capable models. The chosen model describes
 * each uploaded image for media search.
 *
 * REST-only (no server actions). next-intl copy. Saves on selection (no separate
 * Save button — pick = persist, like the chat's model picker).
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { AliasPicker } from "@/components/settings/alias-picker";
import { DEFAULT_IMAGE_MODEL } from "@/lib/chat/models";

export function ImageModelManager() {
  const t = useTranslations("imageModel");
  const [model, setModel] = useState<string>(DEFAULT_IMAGE_MODEL);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    void fetch("/api/settings/image-model")
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
      const res = await fetch("/api/settings/image-model", {
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
          purpose="imageDescribe"
          requireModalities={["image"]}
          direction="down"
        />
        <span className="text-xs text-foreground-muted">{t("hint")}</span>
      </div>
      {saved && <span className="text-sm text-success">{t("saved")}</span>}
    </div>
  );
}
