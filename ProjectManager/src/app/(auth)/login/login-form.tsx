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
  FieldLabel,
  Input,
} from "@/components/ui";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

/**
 * Sign-in form. A wrong email or password both surface the same generic
 * `invalidCredentials` banner so the form never reveals which accounts exist.
 */
export function LoginForm({ firstRun }: { firstRun: boolean }) {
  const t = useTranslations("auth");
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  const emailFieldError =
    state.error === "emailRequired" || state.error === "emailInvalid"
      ? t(`errors.${state.error}`)
      : null;
  const passwordFieldError =
    state.error === "passwordRequired" ? t("errors.passwordRequired") : null;
  const formError =
    state.error === "invalidCredentials" || state.error === "unknown"
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
          aria-invalid={emailFieldError != null}
        />
        {emailFieldError ? <FieldError>{emailFieldError}</FieldError> : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="password">{t("fields.password")}</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={passwordFieldError != null}
        />
        {passwordFieldError ? (
          <FieldError>{passwordFieldError}</FieldError>
        ) : null}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {t("login.submit")}
      </Button>

      {firstRun ? (
        <p className="text-center text-sm text-foreground-muted">
          {t("login.firstRun")}{" "}
          <Link
            href="/register"
            className="font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
          >
            {t("register.title")}
          </Link>
        </p>
      ) : null}
    </form>
  );
}
