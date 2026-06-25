"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  Input,
} from "@/components/ui";

/**
 * Edits the global build timeout (minutes). PUTs to /api/settings/build-timeout;
 * the server clamps + validates (this is a convenience gate, not the real one).
 * Applies starting with the NEXT deploy — existing in-flight builds keep their
 * already-sent timeout.
 */
export function BuildTimeoutForm({
  initial,
  min,
  max,
}: {
  initial: number;
  min: number;
  max: number;
}) {
  const t = useTranslations("settings.buildTimeout");
  const [value, setValue] = useState(String(initial));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/settings/build-timeout", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ buildTimeoutMin: Number(value) }),
      });
      if (!res.ok) {
        setState("error");
        return;
      }
      const data = (await res.json()) as { buildTimeoutMin: number };
      setValue(String(data.buildTimeoutMin)); // reflect server-side clamp
      setState("saved");
    } catch {
      setState("error");
    }
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <Field>
        <FieldLabel htmlFor="build-timeout">{t("label")}</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="build-timeout"
            type="number"
            inputMode="numeric"
            min={min}
            max={max}
            step={1}
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setState("idle");
            }}
            className="w-28"
          />
          <span className="text-sm text-foreground-muted">{t("unit")}</span>
          <Button type="submit" disabled={state === "saving" || value === ""}>
            {state === "saving" ? t("saving") : t("save")}
          </Button>
        </div>
        <FieldHint>{t("hint", { min, max })}</FieldHint>
        {state === "saved" ? (
          <p className="text-xs font-medium text-success">{t("saved")}</p>
        ) : null}
        {state === "error" ? <FieldError>{t("error")}</FieldError> : null}
      </Field>
    </form>
  );
}
