"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Button,
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  Input,
} from "@/components/ui";
import { routingRecordsForHost } from "@/lib/config/hosts";
import type {
  CustomDomainError,
  CustomDomainResult,
} from "@/app/api/sites/[id]/custom-domain/route";

/**
 * Manage a Site's customer custom domains (Cloudflare-for-SaaS). Persisted
 * domains (passed in `domains`) are ALWAYS listed with their routing DNS records,
 * so the operator can re-check setup any time — not just transiently after a
 * submit. Adding a domain POSTs to `/api/sites/<id>/custom-domain` (→ deployer
 * `/attach-domain`), which also returns the one-time cert-validation TXT records.
 *
 * Disabled unless the Site is deployed — the router has no proxy target until the
 * per-Site CMS Worker exists.
 */
export function CustomDomainForm({
  siteId,
  deployed,
  domains,
}: {
  siteId: string;
  deployed: boolean;
  domains: string[];
}) {
  const t = useTranslations("sites.customDomain");
  const router = useRouter();
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<CustomDomainError | null>(null);
  const [pending, setPending] = useState(false);
  // The cert-validation records CF returned for the most recent attach, keyed by
  // hostname. Not persisted (CF-issued, volatile) — fetched on attach / on demand.
  const [validation, setValidation] = useState<
    Record<string, CustomDomainResult["dns"]>
  >({});

  async function attach(host: string) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/custom-domain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: host }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | CustomDomainResult
        | { error?: CustomDomainError };
      if (res.ok && "ok" in data && data.ok) {
        setValidation((v) => ({ ...v, [data.hostname]: data.dns }));
        setHostname("");
        router.refresh(); // reload the persisted domain list
        return;
      }
      setError(("error" in data && data.error) || "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-foreground-muted">{t("description")}</p>

      {!deployed ? (
        <Alert tone="info">
          <AlertBody>{t("notDeployed")}</AlertBody>
        </Alert>
      ) : null}

      {/* Always-visible list of attached domains + their setup records. */}
      {domains.length > 0 ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">{t("attachedHeading")}</h3>
          {domains.map((host) => (
            <DomainCard
              key={host}
              host={host}
              validation={validation[host] ?? null}
              onShowValidation={() => attach(host)}
              busy={pending}
              t={t}
            />
          ))}
        </div>
      ) : null}

      {/* Add a (new) domain. */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (hostname.trim()) attach(hostname.trim().toLowerCase());
        }}
        className="flex flex-col gap-3"
        noValidate
      >
        <Field>
          <FieldLabel htmlFor="customDomain">{t("label")}</FieldLabel>
          <Input
            id="customDomain"
            name="customDomain"
            placeholder="example.com"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={hostname}
            onChange={(e) => setHostname(e.target.value)}
            disabled={!deployed || pending}
          />
          <FieldHint>{t("hint")}</FieldHint>
          {error ? <FieldError>{t(`errors.${error}`)}</FieldError> : null}
        </Field>
        <Button
          type="submit"
          loading={pending}
          disabled={!deployed || pending || hostname.trim().length === 0}
          className="w-fit"
        >
          {t("attach")}
        </Button>
      </form>
    </div>
  );
}

function DomainCard({
  host,
  validation,
  onShowValidation,
  busy,
  t,
}: {
  host: string;
  validation: CustomDomainResult["dns"] | null;
  onShowValidation: () => void;
  busy: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const routing = routingRecordsForHost(host);
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="font-medium">{host}</p>

      {/* Routing records — always shown, derived from the hostname. */}
      <p className="mt-3 text-sm font-medium">{t("step1Routing")}</p>
      <dl className="mt-1 flex flex-col gap-2">
        {routing.isApex ? (
          <>
            <p className="text-xs text-foreground-muted">{t("apexUseA")}</p>
            {routing.apexA.values.map((ip) => (
              <DnsRow key={ip} type="A" name={routing.apexA.name} value={ip} />
            ))}
          </>
        ) : (
          <DnsRow
            type="CNAME"
            name={routing.cname.name}
            value={routing.cname.value}
          />
        )}
      </dl>

      {/* Cert-validation records — on demand (CF-issued, not stored). */}
      <p className="mt-3 text-sm font-medium">{t("step2Cert")}</p>
      {validation ? (
        validation.txt.length > 0 ? (
          <dl className="mt-1 flex flex-col gap-2">
            <p className="text-xs text-foreground-muted">{t("txtAdd")}</p>
            {validation.txt.map((r) => (
              <DnsRow key={r.value} type="TXT" name={r.name} value={r.value} />
            ))}
          </dl>
        ) : (
          <p className="mt-1 text-sm text-foreground-muted">{t("certIssued")}</p>
        )
      ) : (
        <div className="mt-1">
          <Button
            type="button"
            variant="secondary"
            loading={busy}
            disabled={busy}
            onClick={onShowValidation}
            className="w-fit"
          >
            {t("showValidation")}
          </Button>
        </div>
      )}
    </div>
  );
}

function DnsRow({
  type,
  name,
  value,
}: {
  type: string;
  name: string;
  value: string;
}) {
  return (
    <div className="rounded-md bg-surface-muted px-3 py-2 font-mono text-xs">
      <span className="font-semibold">{type}</span>{" "}
      <span className="break-all">{name}</span>{" "}
      <span className="text-foreground-muted">→</span>{" "}
      <span className="break-all">{value}</span>
    </div>
  );
}
