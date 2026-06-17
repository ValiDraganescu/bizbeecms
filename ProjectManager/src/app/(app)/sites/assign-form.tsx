"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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
import type { SiteErrorKey } from "@/app/api/sites/route";

export type AssignableUser = { id: string; email: string };

/**
 * Assign users to a Site. Submits to PUT `/api/sites/<siteId>/users` (server
 * actions 500 on OpenNext/Workers). The candidate pool is already
 * country-filtered server-side; the route re-enforces it. Multi-select; saving
 * replaces the full assignment set.
 */
export function AssignForm({
  siteId,
  assignable,
  assigned,
}: {
  siteId: string;
  assignable: AssignableUser[];
  assigned: string[];
}) {
  const t = useTranslations("sites.assign");
  const tErr = useTranslations("sites.errors");
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<SiteErrorKey | null>(null);
  const [pending, setPending] = useState(false);

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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selected.map((u) => String(u.id)) }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        error?: SiteErrorKey;
      };
      setError(data.error ?? "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {saved ? (
        <Alert tone="success">
          <AlertBody>{t("saved")}</AlertBody>
        </Alert>
      ) : null}

      {error ? (
        <Alert tone="danger">
          <AlertBody>{tErr(error)}</AlertBody>
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
      </Field>

      <Button type="submit" loading={pending} className="w-fit">
        {t("save")}
      </Button>
    </form>
  );
}
