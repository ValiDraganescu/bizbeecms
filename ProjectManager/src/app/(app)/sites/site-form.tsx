"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Button,
  Combobox,
  Field,
  FieldError,
  FieldHint,
  FieldLabel,
  Input,
  type DefaultOption,
} from "@/components/ui";
import type { User } from "@/db/schema";
import {
  COUNTRY_CODES,
  countryNames,
  GLOBAL_COUNTRY,
  type CountryCode,
} from "@/lib/auth/countries";
import { slugify } from "@/lib/site/slug";
import type { SiteErrorKey } from "@/app/api/sites/route";

type ActorCtx = { role: User["role"]; countries: CountryCode[] };

export type SiteFormValues = {
  name: string;
  slug: string;
  /** A country code, or null for global. */
  country: CountryCode | null;
};

/**
 * Shared create/edit Site form. Submits to the REST endpoints (server actions
 * 500 on OpenNext/Workers): create → POST `/api/sites`; edit → PATCH
 * `/api/sites/<siteId>`. Country is single-select: SuperAdmin / global Admins
 * also get a Global option (null); a country-scoped Admin gets only their own
 * countries and no Global (the route re-enforces this).
 *
 * Slug auto-derives from name until the user edits the slug field, then it stays
 * put. On success the form navigates to the saved Site's detail page.
 */
export function SiteForm({
  siteId,
  actor,
  mode,
  initial,
}: {
  /** Required in edit mode — the Site being updated. */
  siteId?: string;
  actor: ActorCtx;
  mode: "create" | "edit";
  initial?: SiteFormValues;
}) {
  const t = useTranslations("sites");
  const router = useRouter();
  const [error, setError] = useState<SiteErrorKey | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const canBeGlobal = actor.role === "SuperAdmin" || actor.countries.length === 0;
  const scopeCodes: CountryCode[] = canBeGlobal
    ? [...COUNTRY_CODES]
    : actor.countries;

  const countryOptions: DefaultOption[] = useMemo(() => {
    const opts: DefaultOption[] = canBeGlobal
      ? [{ id: GLOBAL_COUNTRY, label: t("form.globalCountry") }]
      : [];
    return opts.concat(
      scopeCodes.map((c) => ({ id: c, label: `${c} · ${countryNames[c]}` })),
    );
  }, [canBeGlobal, scopeCodes, t]);

  const initialCountryOption =
    countryOptions.find((o) =>
      initial?.country == null
        ? o.id === GLOBAL_COUNTRY
        : o.id === initial.country,
    ) ?? null;

  const [name, setName] = useState(initial?.name ?? "");
  const [slug, setSlug] = useState(initial?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(mode === "edit");
  const [country, setCountry] = useState<DefaultOption | null>(
    initialCountryOption,
  );

  // Auto-derive slug from name until the user takes over the slug field.
  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name));
  }, [name, slugEdited]);

  // On success, go to the saved Site's detail page.
  useEffect(() => {
    if (savedId) {
      router.push(`/sites/${savedId}`);
      router.refresh();
    }
  }, [savedId, router]);

  const countryValue =
    country?.id === GLOBAL_COUNTRY ? "GLOBAL" : (country?.id ?? "");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setPending(true);
    const payload = { name, slug, country: countryValue };
    try {
      const res =
        mode === "edit"
          ? await fetch(`/api/sites/${siteId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            })
          : await fetch("/api/sites", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
      const data = (await res.json().catch(() => ({}))) as {
        error?: SiteErrorKey;
        savedId?: string;
      };
      if (res.ok && data.savedId) {
        setSavedId(data.savedId);
        return;
      }
      setError(data.error ?? "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  const fieldError = (key: SiteErrorKey) =>
    error === key ? t(`errors.${key}`) : null;

  const formError =
    error &&
    ["notAllowed", "countryNotAllowed", "notFound", "unknown"].includes(error)
      ? t(`errors.${error}`)
      : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {formError ? (
        <Alert tone="danger">
          <AlertBody>{formError}</AlertBody>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel htmlFor="site-name">{t("form.name")}</FieldLabel>
        <Input
          id="site-name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("form.namePlaceholder")}
          aria-invalid={error === "nameRequired"}
        />
        {fieldError("nameRequired") ? (
          <FieldError>{fieldError("nameRequired")}</FieldError>
        ) : null}
      </Field>

      <Field>
        <FieldLabel htmlFor="site-slug">{t("form.slug")}</FieldLabel>
        <Input
          id="site-slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => {
            setSlugEdited(true);
            setSlug(e.target.value);
          }}
          className="font-mono text-sm"
          aria-invalid={
            error === "slugRequired" ||
            error === "slugInvalid" ||
            error === "slugTaken"
          }
        />
        {fieldError("slugRequired") ||
        fieldError("slugInvalid") ||
        fieldError("slugTaken") ? (
          <FieldError>
            {fieldError("slugRequired") ??
              fieldError("slugInvalid") ??
              fieldError("slugTaken")}
          </FieldError>
        ) : (
          <FieldHint>{t("form.slugHint")}</FieldHint>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="site-country">{t("form.country")}</FieldLabel>
        <Combobox
          id="site-country"
          options={countryOptions}
          value={country}
          onChange={setCountry}
          searchable={countryOptions.length > 6}
          placeholder={t("form.countryPlaceholder")}
        />
        <input type="hidden" name="country" value={countryValue} />
        {fieldError("countryInvalid") ? (
          <FieldError>{fieldError("countryInvalid")}</FieldError>
        ) : (
          <FieldHint>
            {canBeGlobal
              ? t("form.countryHintGlobal")
              : t("form.countryHintScoped")}
          </FieldHint>
        )}
      </Field>

      <div className="flex items-center gap-2">
        <Button type="submit" loading={pending} className="w-fit">
          {mode === "create" ? t("form.create") : t("form.save")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => router.back()}
          disabled={pending}
        >
          {t("form.cancel")}
        </Button>
      </div>
    </form>
  );
}
