"use client";

import Link from "next/link";
import { useActionState } from "react";
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
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/validation";
import { registerAction, type RegisterState } from "./actions";

const initialState: RegisterState = {};

/**
 * First-registrant form. On submit it calls the register server action; field
 * and form errors come back as stable keys resolved against `auth.errors.*`.
 */
export function RegisterForm() {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(
    registerAction,
    initialState,
  );

  const fieldError = (key: RegisterState["error"]) =>
    state.error === key ? t(`errors.${key}`) : null;

  // A whole-form (non field-specific) error renders in a banner above.
  const formError =
    state.error === "registrationClosed" ||
    state.error === "emailTaken" ||
    state.error === "unknown"
      ? t(`errors.${state.error}`)
      : null;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {formError ? (
        <Alert tone="danger">
          <AlertBody>{formError}</AlertBody>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel htmlFor="email">{t("fields.email")}</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
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
        <FieldLabel htmlFor="password">{t("fields.password")}</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={
            state.error === "passwordRequired" ||
            state.error === "passwordTooShort"
          }
        />
        {fieldError("passwordRequired") || fieldError("passwordTooShort") ? (
          <FieldError>
            {fieldError("passwordRequired") ?? fieldError("passwordTooShort")}
          </FieldError>
        ) : (
          <FieldHint>
            {t("fields.passwordHint", { min: MIN_PASSWORD_LENGTH })}
          </FieldHint>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="confirmPassword">
          {t("fields.confirmPassword")}
        </FieldLabel>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={state.error === "passwordMismatch"}
        />
        {fieldError("passwordMismatch") ? (
          <FieldError>{fieldError("passwordMismatch")}</FieldError>
        ) : null}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {t("register.submit")}
      </Button>

      <p className="text-center text-sm text-foreground-muted">
        {t("register.haveAccount")}{" "}
        <Link
          href="/login"
          className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
        >
          {t("login.title")}
        </Link>
      </p>
    </form>
  );
}
