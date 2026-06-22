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

export type SiteTagOption = { id: string; label: string };

/**
 * Assign org tags to a Site (pm-roles Slice 7). Submits to PUT
 * `/api/sites/<siteId>/tags` (server actions 500 on OpenNext/Workers). Saving
 * replaces the Site's full tag set. A Site's tags drive Manager reach (a Manager
 * sees a Site only when country matches AND a tag overlaps), so an empty list
 * keeps the Site out of every Manager's view. Admin+ only — gated server-side.
 */
export function SiteTagsForm({
  siteId,
  tags,
  assigned,
}: {
  siteId: string;
  tags: SiteTagOption[];
  assigned: string[];
}) {
  const t = useTranslations("sites.tags");
  const tErr = useTranslations("sites.errors");
  const router = useRouter();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const options: DefaultOption[] = useMemo(
    () => tags.map((tag) => ({ id: tag.id, label: tag.label })),
    [tags],
  );

  const [selected, setSelected] = useState<DefaultOption[]>(() =>
    options.filter((o) => assigned.includes(String(o.id))),
  );

  if (tags.length === 0) {
    return <p className="text-sm text-foreground-muted">{t("none")}</p>;
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaved(false);
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/tags`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tagIds: selected.map((tag) => String(tag.id)) }),
      });
      if (res.ok) {
        setSaved(true);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
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
        <FieldLabel htmlFor="site-tags">{t("label")}</FieldLabel>
        <Combobox<DefaultOption>
          id="site-tags"
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
