"use client";

import { useActionState, useMemo, useState } from "react";
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
import { inviteAction, type InviteState } from "./actions";

const initialState: InviteState = {};

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
  const [state, formAction, pending] = useActionState(
    inviteAction,
    initialState,
  );

  const roleOptions: DefaultOption[] = useMemo(
    () =>
      INVITABLE_ROLES.map((r) => ({
        id: r,
        label: tRoles(
          r === "Admin" ? "admin" : "siteManager",
        ),
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

  const fieldError = (key: InviteState["error"]) =>
    state.error === key ? t(`errors.${key}`) : null;

  const formError =
    state.error &&
    ["notAllowed", "roleNotAllowed", "emailTaken", "alreadyInvited", "unknown"].includes(
      state.error,
    )
      ? t(`errors.${state.error}`)
      : null;

  if (state.success) {
    return (
      <div className="flex flex-col gap-4">
        <Alert tone="success">
          <AlertTitle>
            {state.success.delivered
              ? t("sent.deliveredTitle", { email: state.success.email })
              : t("sent.manualTitle", { email: state.success.email })}
          </AlertTitle>
          <AlertBody>
            {state.success.delivered
              ? t("sent.deliveredBody")
              : t("sent.manualBody")}
          </AlertBody>
        </Alert>

        {!state.success.delivered ? (
          <Field>
            <FieldLabel htmlFor="invite-link">{t("sent.linkLabel")}</FieldLabel>
            <Input
              id="invite-link"
              readOnly
              value={state.success.acceptUrl}
              onFocus={(e) => e.currentTarget.select()}
              className="font-mono text-xs"
            />
          </Field>
        ) : null}
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
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
          defaultValue={state.email ?? ""}
          aria-invalid={
            state.error === "emailRequired" || state.error === "emailInvalid"
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
        {/* Submit the selected role via a hidden input the action reads. */}
        <input type="hidden" name="role" value={role?.id ?? ""} />
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
        {/* One hidden input per selected code; none = global (the action reads
            formData.getAll("country")). */}
        {countries.map((c) => (
          <input key={c.id} type="hidden" name="country" value={c.id} />
        ))}
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
