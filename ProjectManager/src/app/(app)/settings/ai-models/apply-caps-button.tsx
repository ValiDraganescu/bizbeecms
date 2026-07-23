"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertBody, Button } from "@/components/ui";

type ApplyCapsResponse = {
  results: { siteId: string; name: string; capUsd: number | null; error?: string }[];
  ok: number;
  failed: number;
};

/**
 * One-time backfill: re-PATCH every already-minted OpenRouter key to the circuit
 * -breaker cap derived from its Site's quota, with a monthly reset. Keys minted
 * before this feature carry the raw quota as a LIFETIME limit — wrong number,
 * wrong semantics (docs/ai-cost-quotas.md).
 *
 * Idempotent, so re-running after a partial failure is the intended fix; the
 * per-site failures are listed by name rather than collapsed into "some failed".
 */
export function ApplyCapsButton() {
  const t = useTranslations("settings.aiModels.applyCaps");
  const [state, setState] = useState<"idle" | "running" | "done" | "error">("idle");
  const [result, setResult] = useState<ApplyCapsResponse | null>(null);

  async function run() {
    setState("running");
    setResult(null);
    try {
      const res = await fetch("/api/settings/ai-usage/apply-caps", { method: "POST" });
      if (!res.ok) {
        setState("error");
        return;
      }
      setResult((await res.json()) as ApplyCapsResponse);
      setState("done");
    } catch {
      setState("error");
    }
  }

  const failures = result?.results.filter((r) => r.error) ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          loading={state === "running"}
          onClick={() => void run()}
          className="w-fit"
        >
          {t("action")}
        </Button>
        {state === "done" && result ? (
          <p className="text-xs font-medium text-success">
            {t("done", { ok: result.ok, failed: result.failed })}
          </p>
        ) : null}
      </div>

      {state === "error" ? (
        <Alert tone="danger">
          <AlertBody>{t("error")}</AlertBody>
        </Alert>
      ) : null}

      {failures.length > 0 ? (
        <Alert tone="warning">
          <AlertBody>
            <p>{t("failuresIntro")}</p>
            <ul className="mt-1 flex flex-col gap-0.5">
              {failures.map((f) => (
                <li key={f.siteId} className="text-xs">
                  <span className="font-medium">{f.name}</span>
                  <span className="text-foreground-muted"> — {f.error}</span>
                </li>
              ))}
            </ul>
          </AlertBody>
        </Alert>
      ) : null}
    </div>
  );
}
