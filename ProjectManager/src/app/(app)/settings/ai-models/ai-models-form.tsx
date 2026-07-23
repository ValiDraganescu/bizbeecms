"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Button,
  Field,
  FieldHint,
  FieldLabel,
  Input,
} from "@/components/ui";
import {
  AI_PURPOSES,
  aliasKeyFromLabel,
  type AiPurpose,
  type CuratedModel,
  type CuratedPurposes,
} from "@/lib/ai/curated";
import type { CatalogModel } from "@/lib/ai/model-catalog";
import { PurposeEditor } from "./purpose-editor";

/**
 * Curated-model editor. PUTs the whole catalog + pool to
 * /api/settings/ai-models (server actions 500 on OpenNext/Workers); the server
 * normalizes and re-validates the pool against site quotas.
 *
 * Alias keys are DERIVED from the label on create and immutable afterwards —
 * Sites persist the key, so renaming it would orphan their model choice. The
 * label and the underlying model id stay freely editable.
 */
export function AiModelsForm({
  initialPurposes,
  initialPoolUsd,
}: {
  initialPurposes: CuratedPurposes;
  initialPoolUsd: number | null;
}) {
  const t = useTranslations("settings.aiModels");
  const [purposes, setPurposes] = useState(initialPurposes);
  const [poolUsd, setPoolUsd] = useState(
    initialPoolUsd == null ? "" : String(initialPoolUsd),
  );
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<CatalogModel[]>([]);

  // The OpenRouter catalog for the model pickers (public catalog, proxied),
  // fetched ONCE for the whole page. Best-effort: on failure the model fields
  // stay plain free text.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/settings/openrouter-models");
        if (!res.ok) return;
        const data = (await res.json()) as { models?: CatalogModel[] };
        if (!cancelled) setCatalog(data.models ?? []);
      } catch {
        /* the picker is optional */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function updatePurpose(purpose: AiPurpose, models: CuratedModel[]) {
    setPurposes((prev) => ({ ...prev, [purpose]: { models } }));
    setState("idle");
  }

  function addEntry(purpose: AiPurpose) {
    const models = purposes[purpose].models;
    const label = t("newEntryLabel");
    const key = aliasKeyFromLabel(label, models.map((m) => m.key));
    updatePurpose(purpose, [...models, { key, label, model: "", marginPct: 30 }]);
  }

  async function save() {
    setState("saving");
    setErrorMessage(null);
    try {
      const res = await fetch("/api/settings/ai-models", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        // Send the pool as typed — `Number("abc")` is NaN, which JSON-encodes to
        // null and would read as "no pool at all". The server parses + rejects.
        body: JSON.stringify({ purposes, poolUsd }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        purposes?: CuratedPurposes;
        poolUsd?: number | null;
        message?: string;
      };
      if (!res.ok) {
        setErrorMessage(data.message ?? null);
        setState("error");
        return;
      }
      // Reflect the server's normalization (trimmed labels, repaired margins).
      if (data.purposes) setPurposes(data.purposes);
      setPoolUsd(data.poolUsd == null ? "" : String(data.poolUsd));
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field>
        <FieldLabel htmlFor="ai-credit-pool">{t("pool.label")}</FieldLabel>
        <Input
          id="ai-credit-pool"
          type="number"
          inputMode="decimal"
          min={0}
          step={1}
          value={poolUsd}
          onChange={(e) => {
            setPoolUsd(e.target.value);
            setState("idle");
          }}
          placeholder={t("pool.placeholder")}
          className="w-40 font-mono text-sm"
        />
        <FieldHint>{t("pool.hint")}</FieldHint>
      </Field>

      <div className="flex flex-col gap-6">
        {AI_PURPOSES.map((purpose) => (
          <PurposeEditor
            key={purpose}
            purpose={purpose}
            models={purposes[purpose].models}
            catalog={catalog}
            onChange={(models) => updatePurpose(purpose, models)}
            onAdd={() => addEntry(purpose)}
          />
        ))}
      </div>

      {state === "error" ? (
        <Alert tone="danger">
          <AlertBody>{errorMessage ?? t("error")}</AlertBody>
        </Alert>
      ) : null}

      <div className="flex items-center gap-3">
        <Button type="submit" loading={state === "saving"} className="w-fit">
          {t("save")}
        </Button>
        {state === "saved" ? (
          <p className="text-xs font-medium text-success">{t("saved")}</p>
        ) : null}
      </div>
    </form>
  );
}
