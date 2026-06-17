"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, AlertBody, Button } from "@/components/ui";
import type { SiteStatus } from "@/db/schema";
import type { DeployError } from "@/app/api/sites/[id]/deploy/route";

/**
 * Deploy trigger for a Site. POSTs to `/api/sites/<siteId>/deploy` (server
 * actions 500 on OpenNext/Workers); the route re-enforces authz and provisions
 * the Site's CMS Worker via the engine. Disabled while a deploy is in flight
 * (`deploying`) — the engine also guards `alreadyDeploying`. Errors map the
 * engine's `DeployError` keys to localized messages.
 */
export function DeployForm({
  siteId,
  status,
}: {
  siteId: string;
  status: SiteStatus;
}) {
  const t = useTranslations("sites.deploy");
  const router = useRouter();
  const [error, setError] = useState<DeployError | null>(null);
  const [deployed, setDeployed] = useState(false);
  const [workerName, setWorkerName] = useState<string | undefined>(undefined);
  const [pending, setPending] = useState(false);

  const inFlight = status === "deploying" || pending;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setDeployed(false);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: DeployError;
        deployed?: boolean;
        workerName?: string;
      };
      if (res.ok && data.deployed) {
        setDeployed(true);
        setWorkerName(data.workerName);
        router.refresh();
        return;
      }
      setError(data.error ?? "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-foreground-muted">{t("description")}</p>

      {deployed ? (
        <Alert tone="success">
          <AlertBody>
            {workerName
              ? t("deployedWorker", { worker: workerName })
              : t("deployed")}
          </AlertBody>
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger">
          <AlertBody>{t(`errors.${error}`)}</AlertBody>
        </Alert>
      ) : null}

      <Button type="submit" loading={inFlight} disabled={inFlight} className="w-fit">
        {status === "deployed" || status === "failed"
          ? t("redeploy")
          : t("deploy")}
      </Button>
    </form>
  );
}
