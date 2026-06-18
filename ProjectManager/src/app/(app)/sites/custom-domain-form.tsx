"use client";

import { useState } from "react";
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
import type {
  CustomDomainError,
  CustomDomainResult,
} from "@/app/api/sites/[id]/custom-domain/route";

/**
 * Attach a customer custom domain to a deployed Site. POSTs the hostname to
 * `/api/sites/<id>/custom-domain`, which delegates to the deployer's
 * `/attach-domain` (registers the Cloudflare-for-SaaS custom hostname + records
 * the router mapping). On success it shows the DNS records the customer must add
 * at their own registrar — a CNAME to the fallback origin and a TXT for cert
 * validation. The cert stays pending until the customer adds the TXT.
 *
 * Disabled unless the Site is deployed — the router has no proxy target until
 * the per-Site CMS Worker exists.
 */
export function CustomDomainForm({
  siteId,
  deployed,
}: {
  siteId: string;
  deployed: boolean;
}) {
  const t = useTranslations("sites.customDomain");
  const [hostname, setHostname] = useState("");
  const [error, setError] = useState<CustomDomainError | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<CustomDomainResult | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/custom-domain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: hostname.trim().toLowerCase() }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | CustomDomainResult
        | { error?: CustomDomainError };
      if (res.ok && "ok" in data && data.ok) {
        setResult(data);
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
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-foreground-muted">{t("description")}</p>

      {!deployed ? (
        <Alert tone="info">
          <AlertBody>{t("notDeployed")}</AlertBody>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel htmlFor="customDomain">{t("label")}</FieldLabel>
        <Input
          id="customDomain"
          name="customDomain"
          placeholder="restovista.com"
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

      {result ? (
        <Alert tone="success">
          <AlertBody>
            <p className="font-medium">{t("added", { hostname: result.hostname })}</p>
            <p className="mt-1 text-sm">{t("dnsIntro")}</p>
            <dl className="mt-2 flex flex-col gap-2">
              <DnsRow
                type="CNAME"
                name={result.dns.cname.name}
                value={result.dns.cname.value}
              />
              {result.dns.txt ? (
                <DnsRow
                  type="TXT"
                  name={result.dns.txt.name}
                  value={result.dns.txt.value}
                />
              ) : null}
            </dl>
            <p className="mt-2 text-sm text-foreground-muted">
              {t("certPending")}
            </p>
          </AlertBody>
        </Alert>
      ) : null}
    </form>
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
