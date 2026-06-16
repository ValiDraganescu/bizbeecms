"use client";

import { useState } from "react";
import {
  Button,
  Field,
  FieldLabel,
  FieldHint,
  FieldError,
  Input,
} from "@/components/ui";
import { Caption } from "./specimen";

/**
 * The handful of specimens that need real interactivity to be honest: a button
 * that actually enters its loading state, and a field that toggles between its
 * valid and error states. Everything else on the page is static markup.
 */

export function LoadingButtonDemo() {
  const [loading, setLoading] = useState(false);

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        variant="primary"
        loading={loading}
        onClick={() => {
          setLoading(true);
          window.setTimeout(() => setLoading(false), 1600);
        }}
      >
        Deploy site
      </Button>
      <Caption>click → loading</Caption>
    </div>
  );
}

export function ValidationFieldDemo() {
  const [value, setValue] = useState("not-an-email");
  const invalid = value.length > 0 && !value.includes("@");

  return (
    <Field className="w-full max-w-sm">
      <FieldLabel htmlFor="ds-validate">Invite email</FieldLabel>
      <Input
        id="ds-validate"
        type="email"
        value={value}
        aria-invalid={invalid || undefined}
        aria-describedby={invalid ? "ds-validate-error" : "ds-validate-hint"}
        onChange={(e) => setValue(e.target.value)}
        className={
          invalid
            ? "border-danger focus-visible:border-danger focus-visible:ring-danger"
            : undefined
        }
      />
      {invalid ? (
        <FieldError id="ds-validate-error">
          Enter a valid email address.
        </FieldError>
      ) : (
        <FieldHint id="ds-validate-hint">
          They&apos;ll receive an invite to join this Site.
        </FieldHint>
      )}
    </Field>
  );
}
