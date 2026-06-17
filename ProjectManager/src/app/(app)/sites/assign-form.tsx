"use client";

import { useMemo, useState } from "react";
import { useActionState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Button,
  Combobox,
  Field,
  FieldLabel,
  type DefaultOption,
} from "@/components/ui";
import type { AssignState } from "./actions";

const initialState: AssignState = {};

export type AssignableUser = { id: string; email: string };

/**
 * Assign users to a Site. The candidate pool is already country-filtered
 * server-side; the action re-enforces it. Multi-select; saving replaces the
 * full assignment set.
 */
export function AssignForm({
  action,
  assignable,
  assigned,
}: {
  action: (state: AssignState, formData: FormData) => Promise<AssignState>;
  assignable: AssignableUser[];
  assigned: string[];
}) {
  const t = useTranslations("sites.assign");
  const [state, formAction, pending] = useActionState(action, initialState);

  const options: DefaultOption[] = useMemo(
    () => assignable.map((u) => ({ id: u.id, label: u.email })),
    [assignable],
  );

  const [selected, setSelected] = useState<DefaultOption[]>(() =>
    options.filter((o) => assigned.includes(String(o.id))),
  );

  if (assignable.length === 0) {
    return (
      <p className="text-sm text-foreground-muted">{t("noneAssignable")}</p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {state.saved ? (
        <Alert tone="success">
          <AlertBody>{t("saved")}</AlertBody>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel htmlFor="site-users">{t("label")}</FieldLabel>
        <Combobox<DefaultOption>
          id="site-users"
          multiple
          options={options}
          value={selected}
          onChange={setSelected}
          searchable={options.length > 6}
          placeholder={t("placeholder")}
        />
        {selected.map((u) => (
          <input key={u.id} type="hidden" name="user" value={u.id} />
        ))}
      </Field>

      <Button type="submit" loading={pending} className="w-fit">
        {t("save")}
      </Button>
    </form>
  );
}
