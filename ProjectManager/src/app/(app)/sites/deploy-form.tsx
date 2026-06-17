"use client";

import { useActionState } from "react";
import { useTranslations } from "next-intl";
import { Alert, AlertBody, Button } from "@/components/ui";
import type { SiteStatus } from "@/db/schema";
import type { DeployState } from "./actions";

const initialState: DeployState = {};

/**
 * Deploy trigger for a Site. The button provisions/updates the Site's CMS
 * Worker via the engine; authz is re-enforced server-side in `deploySiteAction`.
 * Disabled while a deploy is in flight (`deploying`) — the engine also guards
 * `alreadyDeploying`. Errors map the engine's `DeployErrorKey` (+ gate keys) to
 * localized messages.
 */
export function DeployForm({
  action,
  status,
}: {
  action: (state: DeployState, formData: FormData) => Promise<DeployState>;
  status: SiteStatus;
}) {
  const t = useTranslations("sites.deploy");
  const [state, formAction, pending] = useActionState(action, initialState);

  const inFlight = status === "deploying" || pending;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-foreground-muted">{t("description")}</p>

      {state.deployed ? (
        <Alert tone="success">
          <AlertBody>
            {state.workerName
              ? t("deployedWorker", { worker: state.workerName })
              : t("deployed")}
          </AlertBody>
        </Alert>
      ) : null}

      {state.error ? (
        <Alert tone="danger">
          <AlertBody>{t(`errors.${state.error}`)}</AlertBody>
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
