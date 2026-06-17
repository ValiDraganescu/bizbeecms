"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, AlertBody, Button } from "@/components/ui";
import type { SiteStatus } from "@/db/schema";
import type { DeployError } from "@/app/api/sites/[id]/deploy/route";

/**
 * Deploy trigger for a Site (async). POSTs to `/api/sites/<siteId>/deploy`,
 * which latches the Site to `deploying` and hands the real build off to the
 * deployer Worker's container. The build finishes out-of-band (the deployer
 * calls back to set deployed/failed), so while `status === "deploying"` this
 * form polls by refreshing the route until the status resolves.
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
  const [started, setStarted] = useState(false);
  const [pending, setPending] = useState(false);

  const inFlight = status === "deploying" || pending;

  // While a deploy is in flight, poll for the resolved status.
  useEffect(() => {
    if (status !== "deploying") return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [status, router]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStarted(false);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy`, {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: DeployError;
        accepted?: boolean;
      };
      if (res.ok && data.accepted) {
        setStarted(true);
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

      {status === "deploying" ? (
        <Alert tone="info">
          <AlertBody>{t("inProgress")}</AlertBody>
        </Alert>
      ) : status === "deployed" && started ? (
        <Alert tone="success">
          <AlertBody>{t("deployed")}</AlertBody>
        </Alert>
      ) : null}

      {status === "failed" && started ? (
        <Alert tone="danger">
          <AlertBody>{t("errors.uploadFailed")}</AlertBody>
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
