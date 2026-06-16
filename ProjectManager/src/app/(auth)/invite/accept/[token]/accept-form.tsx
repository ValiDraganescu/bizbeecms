"use client";

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
import { acceptInviteAction, type AcceptState } from "./actions";

const initialState: AcceptState = {};

/** Set-password form for accepting an invite. Token is bound from the route. */
export function AcceptForm({ token }: { token: string }) {
  const t = useTranslations("invites.accept");
  const action = acceptInviteAction.bind(null, token);
  const [state, formAction, pending] = useActionState(action, initialState);

  const passwordFieldError =
    state.error === "passwordRequired" || state.error === "passwordTooShort"
      ? t(`errors.${state.error}`)
      : null;
  const confirmFieldError =
    state.error === "passwordMismatch" ? t("errors.passwordMismatch") : null;

  // Invite-level failures (expired/used/taken between page load and submit).
  const formError =
    state.error &&
    ["notFound", "expired", "accepted", "emailTaken", "unknown"].includes(
      state.error,
    )
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
        <FieldLabel htmlFor="password">{t("password")}</FieldLabel>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={passwordFieldError != null}
        />
        {passwordFieldError ? (
          <FieldError>{passwordFieldError}</FieldError>
        ) : (
          <FieldHint>
            {t("passwordHint", { min: MIN_PASSWORD_LENGTH })}
          </FieldHint>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="confirmPassword">
          {t("confirmPassword")}
        </FieldLabel>
        <Input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          autoComplete="new-password"
          required
          aria-invalid={confirmFieldError != null}
        />
        {confirmFieldError ? (
          <FieldError>{confirmFieldError}</FieldError>
        ) : null}
      </Field>

      <Button type="submit" loading={pending} className="w-full">
        {t("submit")}
      </Button>
    </form>
  );
}
