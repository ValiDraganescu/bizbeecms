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
  hasMintedOpenrouterKey = false,
  initialMintingEnabled = false,
  initialMonthlyLimitUsd = null,
}: {
  /** Required in edit mode — the Site being updated. */
  siteId?: string;
  actor: ActorCtx;
  mode: "create" | "edit";
  initial?: SiteFormValues;
  /** Edit mode only: whether a key has already been minted (never the key itself). */
  hasMintedOpenrouterKey?: boolean;
  /** Edit mode only: initial state of the minting toggle. */
  initialMintingEnabled?: boolean;
  /** Edit mode only: initial monthly spend cap (whole USD), or null for no cap. */
  initialMonthlyLimitUsd?: number | null;
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
  // OpenRouter key-minting controls (edit mode). The key value is never
  // user-entered now — PM mints it on deploy. Here we only set the toggle + cap.
  const [mintingEnabled, setMintingEnabled] = useState(initialMintingEnabled);
  const [monthlyLimit, setMonthlyLimit] = useState(
    initialMonthlyLimitUsd == null ? "" : String(initialMonthlyLimitUsd),
  );
  // Locally track whether a minted key exists so the delete button hides after
  // a successful revoke without a full page reload.
  const [hasKey, setHasKey] = useState(hasMintedOpenrouterKey);
  const [deleting, setDeleting] = useState(false);

  async function onDeleteKey() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/sites/${siteId}/openrouter-key`, {
        method: "DELETE",
      });
      if (res.ok) {
        setHasKey(false);
        router.refresh();
      }
    } finally {
      setDeleting(false);
    }
  }

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
    const payload: Record<string, unknown> = {
      name,
      slug,
      country: countryValue,
    };
    if (mode === "edit") {
      payload.openrouterMintingEnabled = mintingEnabled;
      const trimmed = monthlyLimit.trim();
      payload.openrouterMonthlyLimitUsd =
        trimmed === "" ? null : Number(trimmed);
    }
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

      {mode === "edit" ? (
        <Field>
          <FieldLabel>{t("form.openrouterMinting")}</FieldLabel>
          <label className="flex items-start gap-2.5 text-sm text-foreground">
            <input
              id="site-openrouter-minting"
              type="checkbox"
              checked={mintingEnabled}
              onChange={(e) => setMintingEnabled(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-border accent-primary outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            <span>{t("form.openrouterMintingToggle")}</span>
          </label>
          <FieldHint>{t("form.openrouterMintingHint")}</FieldHint>

          {mintingEnabled ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <FieldLabel htmlFor="site-openrouter-limit">
                {t("form.openrouterMonthlyLimit")}
              </FieldLabel>
              <Input
                id="site-openrouter-limit"
                name="openrouterMonthlyLimitUsd"
                type="number"
                min={0}
                step={1}
                inputMode="numeric"
                value={monthlyLimit}
                onChange={(e) => setMonthlyLimit(e.target.value)}
                placeholder={t("form.openrouterMonthlyLimitPlaceholder")}
                className="font-mono text-sm"
              />
              <FieldHint>{t("form.openrouterMonthlyLimitHint")}</FieldHint>
            </div>
          ) : null}

          {hasKey ? (
            <div className="mt-2 flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                loading={deleting}
                onClick={onDeleteKey}
              >
                {t("form.openrouterKeyDelete")}
              </Button>
              <FieldHint>{t("form.openrouterKeyMinted")}</FieldHint>
            </div>
          ) : null}
        </Field>
      ) : null}

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
