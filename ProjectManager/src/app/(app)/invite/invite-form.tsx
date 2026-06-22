"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  AlertTitle,
  Button,
  Combobox,
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  Input,
  type DefaultOption,
} from "@/components/ui";
import type { Role } from "@/db/schema";
import {
  COUNTRY_CODES,
  countryNames,
  type CountryCode,
} from "@/lib/auth/countries";
import { INVITABLE_ROLES } from "@/lib/invite/authz";
import type { InviteErrorKey, InviteSuccess } from "@/app/api/invite/route";

type InviterCtx = { role: Role; countries: CountryCode[] };

/**
 * Invite form. Role is single-select; country is MULTI-select. The option sets
 * mirror the server-side authz (a country-scoped Admin can only pick within
 * their own countries; selecting none means global — allowed only for
 * SuperAdmin / global Admins) so the UI doesn't offer choices the action would
 * reject — the action remains the real gate.
 */
export function InviteForm({ inviter }: { inviter: InviterCtx }) {
  const t = useTranslations("invites");
  const tRoles = useTranslations("roles");
  const [error, setError] = useState<InviteErrorKey | null>(null);
  const [success, setSuccess] = useState<InviteSuccess | null>(null);
  const [emailEcho, setEmailEcho] = useState("");
  const [pending, setPending] = useState(false);

  const roleOptions: DefaultOption[] = useMemo(
    () =>
      INVITABLE_ROLES.map((r) => ({
        id: r,
        // role i18n keys are the role name with a lowercased first letter
        // (Admin → admin, Editor → editor, Manager → manager).
        label: tRoles(r.charAt(0).toLowerCase() + r.slice(1)),
      })),
    [tRoles],
  );

  // Country options: a country-scoped Admin (own scope non-empty) can only pick
  // within their own countries; SuperAdmin and global Admins get the full list.
  // Leaving the selection empty means "all countries" (global) — only valid for
  // SuperAdmin / global Admins (the action enforces this).
  const scopeCodes: CountryCode[] =
    inviter.role !== "SuperAdmin" && inviter.countries.length > 0
      ? inviter.countries
      : [...COUNTRY_CODES];

  const countryOptions: DefaultOption[] = useMemo(
    () =>
      scopeCodes.map((c) => ({ id: c, label: `${c} · ${countryNames[c]}` })),
    [scopeCodes],
  );

  const canBeGlobal =
    inviter.role === "SuperAdmin" || inviter.countries.length === 0;

  const [role, setRole] = useState<DefaultOption | null>(null);
  const [countries, setCountries] = useState<DefaultOption[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    setEmailEcho(email);
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          role: role?.id ?? "",
          countries: countries.map((c) => String(c.id)),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: InviteErrorKey;
        success?: InviteSuccess;
      };
      if (res.ok && data.success) {
        setSuccess(data.success);
        return;
      }
      setError(data.error ?? "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const fieldError = (key: InviteErrorKey) =>
    error === key ? t(`errors.${key}`) : null;

  const formError =
    error &&
    ["notAllowed", "roleNotAllowed", "emailTaken", "alreadyInvited", "unknown"].includes(
      error,
    )
      ? t(`errors.${error}`)
      : null;

  if (success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          <AlertTitle>
            {success.delivered
              ? t("sent.deliveredTitle", { email: success.email })
              : t("sent.manualTitle", { email: success.email })}
          </AlertTitle>
          <AlertBody>
            {success.delivered
              ? t("sent.deliveredBody")
              : t("sent.manualBody")}
          </AlertBody>
        </Alert>

        {!success.delivered ? (
          <Field>
            <FieldLabel htmlFor="invite-link">{t("sent.linkLabel")}</FieldLabel>
            <Input
              id="invite-link"
              readOnly
              value={success.acceptUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
          </Field>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? (
        <Alert tone="danger">
          <AlertBody>{formError}</AlertBody>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel htmlFor="invite-email">{t("form.email")}</FieldLabel>
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="off"
          required
          defaultValue={emailEcho}
          aria-invalid={
            error === "emailRequired" || error === "emailInvalid"
          }
        />
        {fieldError("emailRequired") || fieldError("emailInvalid") ? (
          <FieldError>
            {fieldError("emailRequired") ?? fieldError("emailInvalid")}
          </FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="invite-role">{t("form.role")}</FieldLabel>
        <Combobox
          id="invite-role"
          options={roleOptions}
          value={role}
          onChange={setRole}
          searchable={false}
          placeholder={t("form.rolePlaceholder")}
        />
        {fieldError("roleInvalid") || fieldError("roleNotAllowed") ? (
          <FieldError>
            {fieldError("roleInvalid") ?? fieldError("roleNotAllowed")}
          </FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="invite-country">{t("form.country")}</FieldLabel>
        <Combobox<DefaultOption>
          id="invite-country"
          multiple
          options={countryOptions}
          value={countries}
          onChange={setCountries}
          searchable={countryOptions.length > 6}
          placeholder={t("form.countryPlaceholder")}
        />
        {fieldError("countryInvalid") || fieldError("countryNotAllowed") ? (
          <FieldError>
            {fieldError("countryInvalid") ?? fieldError("countryNotAllowed")}
          </FieldError>
        ) : (
          <FieldHint>
            {canBeGlobal ? t("form.countryHintGlobal") : t("form.countryHintScoped")}
          </FieldHint>
        )}
      </Field>

      <Button type="submit" loading={pending} className="w-fit">
        {t("form.submit")}
      </Button>
    </form>
  );
}
