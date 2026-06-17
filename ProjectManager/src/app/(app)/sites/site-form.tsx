"use client";

import { useEffect, useMemo, useState } from "react";
import { useActionState } from "react";
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
import type { SiteFormState } from "./actions";

const initialState: SiteFormState = {};

type ActorCtx = { role: User["role"]; countries: CountryCode[] };

export type SiteFormValues = {
  name: string;
  slug: string;
  /** A country code, or null for global. */
  country: CountryCode | null;
};

/**
 * Shared create/edit Site form. `action` is the server action already bound to
 * a site id when editing. Country is single-select: SuperAdmin / global Admins
 * also get a Global option (null); a country-scoped Admin gets only their own
 * countries and no Global (the action re-enforces this).
 *
 * Slug auto-derives from name until the user edits the slug field, then it stays
 * put. On success the form navigates to the saved Site's detail page.
 */
export function SiteForm({
  action,
  actor,
  mode,
  initial,
}: {
  action: (state: SiteFormState, formData: FormData) => Promise<SiteFormState>;
  actor: ActorCtx;
  mode: "create" | "edit";
  initial?: SiteFormValues;
}) {
  const t = useTranslations("sites");
  const router = useRouter();
  const [state, formAction, pending] = useActionState(action, initialState);

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
    if (state.savedId) router.push(`/sites/${state.savedId}`);
  }, [state.savedId, router]);

  const fieldError = (key: SiteFormState["error"]) =>
    state.error === key ? t(`errors.${key}`) : null;

  const formError =
    state.error &&
    ["notAllowed", "countryNotAllowed", "notFound", "unknown"].includes(
      state.error,
    )
      ? t(`errors.${state.error}`)
      : null;

  const countryValue =
    country?.id === GLOBAL_COUNTRY ? "GLOBAL" : (country?.id ?? "");

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
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
          aria-invalid={state.error === "nameRequired"}
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
            state.error === "slugRequired" ||
            state.error === "slugInvalid" ||
            state.error === "slugTaken"
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
