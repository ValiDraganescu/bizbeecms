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
import {
  routingRecordsForHost,
  isApex,
  CUSTOM_DOMAIN_FALLBACK_ORIGIN,
  CUSTOM_DOMAIN_APEX_IPS,
} from "@/lib/config/hosts";
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
  domains: { hostname: string; redirectTo: string | null }[];
}) {
  const t = useTranslations("sites.customDomain");
  const router = useRouter();
  const [hostname, setHostname] = useState("");
  const [mode, setMode] = useState<"serve" | "redirect">("serve");
  const [redirectTo, setRedirectTo] = useState("");
  const [error, setError] = useState<CustomDomainError | null>(null);
  const [pending, setPending] = useState(false);
  // The cert-validation records CF returned for the most recent attach, keyed by
  // hostname. Not persisted (CF-issued, volatile) — fetched on attach / on demand.
  const [validation, setValidation] = useState<
    Record<string, CustomDomainResult["dns"]>
  >({});

  // Default redirect target = www.<apex> when the entered host is a bare apex,
  // so the common apex→www case is one click. The operator can override it.
  const apexDefault = isApex(hostname) ? `www.${hostname.trim()}` : "";

  async function attach(host: string, redirect?: string | null) {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/custom-domain`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hostname: host, redirectTo: redirect ?? null }),
      });
      const data = (await res.json().catch(() => ({}))) as
        | CustomDomainResult
        | { error?: CustomDomainError };
      if (res.ok && "ok" in data && data.ok) {
        if (data.dns) setValidation((v) => ({ ...v, [data.hostname]: data.dns }));
        setHostname("");
        setRedirectTo("");
        setMode("serve");
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

      {/* Always-visible setup guidance — shown before ANY domain is attached so
          the operator knows their options up front, not by trial and error. */}
      <SetupGuide t={t} />

      {/* Always-visible list of attached domains + their setup records. */}
      {domains.length > 0 ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-sm font-semibold">{t("attachedHeading")}</h3>
          {domains.map((d) => (
            <DomainCard
              key={d.hostname}
              host={d.hostname}
              redirectTo={d.redirectTo}
              validation={validation[d.hostname] ?? null}
              onShowValidation={() => attach(d.hostname, d.redirectTo)}
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
          const host = hostname.trim().toLowerCase();
          if (!host) return;
          const target =
            mode === "redirect"
              ? (redirectTo.trim() || apexDefault).toLowerCase()
              : null;
          attach(host, target);
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
        </Field>

        {/* Serve vs redirect. Default serve; redirect powers apex→www. */}
        <fieldset className="flex flex-col gap-2" disabled={!deployed || pending}>
          <legend className="text-sm font-medium">{t("mode.legend")}</legend>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              value="serve"
              checked={mode === "serve"}
              onChange={() => setMode("serve")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{t("mode.serveLabel")}</span>
              <span className="block text-xs text-foreground-muted">
                {t("mode.serveHint")}
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              type="radio"
              name="mode"
              value="redirect"
              checked={mode === "redirect"}
              onChange={() => setMode("redirect")}
              className="mt-1"
            />
            <span>
              <span className="font-medium">{t("mode.redirectLabel")}</span>
              <span className="block text-xs text-foreground-muted">
                {t("mode.redirectHint")}
              </span>
            </span>
          </label>
        </fieldset>

        {mode === "redirect" ? (
          <Field>
            <FieldLabel htmlFor="redirectTo">{t("mode.targetLabel")}</FieldLabel>
            <Input
              id="redirectTo"
              name="redirectTo"
              placeholder={apexDefault || "www.example.com"}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={redirectTo}
              onChange={(e) => setRedirectTo(e.target.value)}
              disabled={!deployed || pending}
            />
            <FieldHint>{t("mode.targetHint")}</FieldHint>
          </Field>
        ) : null}

        {error ? <FieldError>{t(`errors.${error}`)}</FieldError> : null}
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

/**
 * Always-visible explainer of the DNS options, rendered before any domain is
 * attached. The two common paths (CNAME for a subdomain, A records for the apex)
 * are shown inline with concrete values; the rarer paths (apex CNAME-flattening,
 * AAAA, DCV delegation) live in a collapsed <details> so the empty state stays
 * scannable. Native <details> — no JS, no extra dep.
 */
function SetupGuide({ t }: { t: ReturnType<typeof useTranslations> }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted/40 p-4">
      <h3 className="text-sm font-semibold">{t("guide.heading")}</h3>
      <p className="text-sm text-foreground-muted">{t("guide.intro")}</p>

      {/* Recommended: subdomain via CNAME. */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("guide.cnameTitle")}</p>
        <p className="text-xs text-foreground-muted">{t("guide.cnameBody")}</p>
        <DnsRow
          type="CNAME"
          name="www.example.com"
          value={CUSTOM_DOMAIN_FALLBACK_ORIGIN}
        />
        <p className="text-xs text-foreground-muted">{t("guide.apexRedirect")}</p>
      </div>

      {/* Apex via A records. */}
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{t("guide.apexTitle")}</p>
        <p className="text-xs text-foreground-muted">{t("guide.apexBody")}</p>
        {CUSTOM_DOMAIN_APEX_IPS.map((ip) => (
          <DnsRow key={ip} type="A" name="example.com" value={ip} />
        ))}
      </div>

      {/* Less common paths, collapsed by default. */}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-foreground-muted">
          {t("guide.moreTitle")}
        </summary>
        <ul className="mt-2 flex list-disc flex-col gap-2 pl-5 text-xs text-foreground-muted">
          <li>{t("guide.moreFlatten")}</li>
          <li>{t("guide.moreAAAA")}</li>
          <li>{t("guide.moreDcv")}</li>
        </ul>
      </details>

      <p className="text-xs text-foreground-muted">{t("guide.certNote")}</p>
    </div>
  );
}

function DomainCard({
  host,
  redirectTo,
  validation,
  onShowValidation,
  busy,
  t,
}: {
  host: string;
  redirectTo: string | null;
  validation: CustomDomainResult["dns"] | null;
  onShowValidation: () => void;
  busy: boolean;
  t: ReturnType<typeof useTranslations>;
}) {
  const routing = routingRecordsForHost(host);
  const redirectHost = redirectTo?.replace(/^https?:\/\//, "") ?? null;
  return (
    <div className="rounded-lg border border-border p-4">
      <p className="font-medium">{host}</p>
      {redirectHost ? (
        <p className="mt-0.5 text-xs text-foreground-muted">
          {t("redirectsTo", { target: redirectHost })}
        </p>
      ) : null}

      {/* Routing records — always shown, derived from the hostname. The host still
          needs to reach our edge (and get a cert) even when it only redirects, so
          these apply to serve AND redirect entries. */}
      <p className="mt-3 text-sm font-medium">{t("step1Routing")}</p>
      <dl className="mt-1 flex flex-col gap-2">
        {routing.isApex ? (
          <>
            {/* Apex: A records OR a flattened CNAME — pick what the registrar
                supports. Both are valid; show both. */}
            <p className="text-xs text-foreground-muted">{t("apexUseA")}</p>
            {routing.apexA.values.map((ip) => (
              <DnsRow key={ip} type="A" name={routing.apexA.name} value={ip} />
            ))}
            <p className="text-xs text-foreground-muted">{t("apexOrCname")}</p>
            <DnsRow
              type="CNAME"
              name={routing.apexCname.name}
              value={routing.apexCname.value}
            />
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
