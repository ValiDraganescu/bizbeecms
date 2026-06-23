"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Alert, AlertBody, Button } from "@/components/ui";
import type { SiteStatus } from "@/db/schema";
import type { DeployError } from "@/app/api/sites/[id]/deploy/route";
import type { CmsRelease } from "@/lib/deploy/cms-releases";
import { refForVersion } from "@/lib/deploy/cms-releases";

/**
 * Deploy trigger for a Site (async). POSTs to `/api/sites/<siteId>/deploy`,
 * which latches the Site to `deploying` and hands the real build off to the
 * deployer Worker's container. The build finishes out-of-band (the deployer
 * calls back to set deployed/failed), so while `status === "deploying"` this
 * form polls by refreshing the route until the status resolves.
 *
 * cms-releases Slice 5: a CMS-version picker (TAGGED RELEASES ONLY, loaded from
 * `/api/cms-releases/tags`) + a "view release notes" action (in-app modal,
 * never a native dialog). The chosen `cms-v<ver>` ref is POSTed as `ref`.
 */
export function DeployForm({
  siteId,
  status,
  stuck = false,
}: {
  siteId: string;
  status: SiteStatus;
  /** Server-computed: a `deploying` Site that's been in-flight too long. */
  stuck?: boolean;
}) {
  const t = useTranslations("sites.deploy");
  const router = useRouter();
  const [error, setError] = useState<DeployError | null>(null);
  const [started, setStarted] = useState(false);
  const [mintWarning, setMintWarning] = useState(false);
  const [keyWarning, setKeyWarning] = useState(false);
  const [pending, setPending] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Version picker state.
  const [releases, setReleases] = useState<CmsRelease[] | null>(null);
  const [version, setVersion] = useState("");
  const [notesFor, setNotesFor] = useState<string | null>(null);

  // A stuck deploy is no longer really in flight — let the operator act on it.
  const inFlight = (status === "deploying" && !stuck) || pending;

  // While a deploy is genuinely in flight, poll for the resolved status. A stuck
  // deploy won't resolve on its own, so stop polling and surface the controls.
  useEffect(() => {
    if (status !== "deploying" || stuck) return;
    const id = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(id);
  }, [status, stuck, router]);

  // Load the available CMS releases once. Defaults the picker to the latest tag.
  useEffect(() => {
    let live = true;
    fetch("/api/cms-releases/tags")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        if (!live) return;
        const list = (d as { releases?: CmsRelease[] }).releases ?? [];
        setReleases(list);
        if (list.length > 0) setVersion(list[0].version);
      })
      .catch(() => live && setReleases([]));
    return () => {
      live = false;
    };
  }, []);

  async function onCancel() {
    setError(null);
    setCancelling(true);
    try {
      await fetch(`/api/sites/${siteId}/deploy/cancel`, { method: "POST" });
      router.refresh();
    } catch {
      setError("unknown");
    } finally {
      setCancelling(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStarted(false);
    setMintWarning(false);
    setKeyWarning(false);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/deploy`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(version ? { ref: refForVersion(version) } : {}),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: DeployError;
        accepted?: boolean;
        mintWarning?: boolean;
        keyWarning?: boolean;
      };
      if (res.ok && data.accepted) {
        setStarted(true);
        setMintWarning(data.mintWarning === true);
        setKeyWarning(data.keyWarning === true);
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

  const hasReleases = releases !== null && releases.length > 0;

  return (
    <>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <p className="text-sm text-foreground-muted">{t("description")}</p>

        {/* Version picker — TAGGED RELEASES ONLY. */}
        {releases === null ? (
          <p className="text-sm text-foreground-muted">{t("version.loading")}</p>
        ) : hasReleases ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="cms-version"
              className="text-xs font-medium uppercase tracking-wide text-foreground-muted"
            >
              {t("version.label")}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <select
                id="cms-version"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                disabled={inFlight}
                className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
              >
                {releases.map((r) => (
                  <option key={r.version} value={r.version}>
                    {r.version}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setNotesFor(version)}
                disabled={!version}
                className="w-fit"
              >
                {t("version.viewNotes")}
              </Button>
            </div>
          </div>
        ) : (
          <Alert tone="info">
            <AlertBody>{t("version.none")}</AlertBody>
          </Alert>
        )}

        {status === "deploying" && stuck ? (
          <Alert tone="warning">
            <AlertBody>{t("stuck")}</AlertBody>
          </Alert>
        ) : status === "deploying" ? (
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

        {mintWarning ? (
          <Alert tone="warning">
            <AlertBody>{t("mintWarning")}</AlertBody>
          </Alert>
        ) : null}

        {keyWarning ? (
          <Alert tone="warning">
            <AlertBody>{t("keyWarning")}</AlertBody>
          </Alert>
        ) : null}

        {error ? (
          <Alert tone="danger">
            <AlertBody>{t(`errors.${error}`)}</AlertBody>
          </Alert>
        ) : null}

        <div className="flex gap-3">
          <Button
            type="submit"
            loading={inFlight}
            disabled={inFlight || !hasReleases}
            className="w-fit"
          >
            {status === "deployed" || status === "failed" || stuck
              ? t("redeploy")
              : t("deploy")}
          </Button>
          {status === "deploying" && stuck ? (
            <Button
              type="button"
              variant="secondary"
              onClick={onCancel}
              loading={cancelling}
              disabled={cancelling || pending}
              className="w-fit"
            >
              {t("cancel")}
            </Button>
          ) : null}
        </div>
      </form>

      {notesFor !== null ? (
        <ReleaseNotesModal version={notesFor} onClose={() => setNotesFor(null)} />
      ) : null}
    </>
  );
}

/** In-app release-notes viewer — never a native dialog (CAVEATS). */
function ReleaseNotesModal({
  version,
  onClose,
}: {
  version: string;
  onClose: () => void;
}) {
  const t = useTranslations("sites.deploy");
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  // Close on Escape — keeps the in-app modal keyboard-accessible.
  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );
  useEffect(() => {
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onKey]);

  useEffect(() => {
    let live = true;
    fetch(`/api/cms-releases/release-notes?version=${encodeURIComponent(version)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then(
        (d) => live && setMarkdown((d as { markdown?: string }).markdown ?? ""),
      )
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [version]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("version.notesTitle", { version })}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-lg border border-border bg-surface shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight">
            {t("version.notesTitle", { version })}
          </h2>
          <Button variant="ghost" onClick={onClose} className="w-fit">
            {t("version.close")}
          </Button>
        </div>
        <div className="overflow-y-auto px-6 py-4">
          {failed ? (
            <Alert tone="danger">
              <AlertBody>{t("version.notesError")}</AlertBody>
            </Alert>
          ) : markdown === null ? (
            <p className="text-sm text-foreground-muted">{t("version.loading")}</p>
          ) : markdown.trim() === "" ? (
            <p className="text-sm text-foreground-muted">{t("version.notesEmpty")}</p>
          ) : (
            // ponytail: raw markdown in a <pre> — no markdown lib for an admin
            // notes viewer; add react-markdown if rich rendering is ever asked for.
            <pre className="whitespace-pre-wrap break-words font-mono text-sm text-foreground">
              {markdown}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
}
