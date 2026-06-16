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
  FieldLabel,
  Input,
  type DefaultOption,
} from "@/components/ui";
import type { Role } from "@/db/schema";
import {
  COUNTRY_CODES,
  countryNames,
  GLOBAL_COUNTRY,
} from "@/lib/auth/countries";
import { INVITABLE_ROLES } from "@/lib/invite/authz";
import { inviteAction, type InviteState } from "./actions";

const initialState: InviteState = {};

type InviterCtx = { role: Role; country: string | null };

/**
 * Invite form. Role + country are picked via Combobox; the option sets mirror
 * the server-side authz (a country-scoped Admin can only invite into their own
 * country) so the UI doesn't offer choices the action would reject anyway —
 * the action remains the real gate.
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

  // Country options: a country-scoped Admin can only target their own country;
  // SuperAdmin and global Admins get the full list plus "Global".
  const countryOptions: DefaultOption[] = useMemo(() => {
    if (inviter.role === "Admin" && inviter.country !== null) {
      return [{ id: inviter.country, label: inviter.country }];
    }
    return [
      { id: GLOBAL_COUNTRY, label: t("form.globalCountry") },
      ...COUNTRY_CODES.map((c) => ({ id: c, label: `${c} · ${countryNames[c]}` })),
    ];
  }, [inviter, t]);

  const [role, setRole] = useState<DefaultOption | null>(null);
  const [country, setCountry] = useState<DefaultOption | null>(
    countryOptions[0] ?? null,
  );

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
        <Combobox
          id="invite-country"
          options={countryOptions}
          value={country}
          onChange={setCountry}
          searchable={countryOptions.length > 6}
          placeholder={t("form.countryPlaceholder")}
        />
        <input
          type="hidden"
          name="country"
          value={country?.id ?? GLOBAL_COUNTRY}
        />
        {fieldError("countryInvalid") || fieldError("countryNotAllowed") ? (
          <FieldError>
            {fieldError("countryInvalid") ?? fieldError("countryNotAllowed")}
          </FieldError>
        ) : null}
      </Field>

      <Button type="submit" loading={pending} className="w-fit">
        {t("form.submit")}
      </Button>
    </form>
  );
}
