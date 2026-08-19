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
import { isValidSlug, slugify, slugifyTyping } from "@/lib/site/slug";
import type { SiteErrorKey } from "@/app/api/sites/route";

type ActorCtx = { role: User["role"]; countries: CountryCode[] };
export type TagOption = { id: string; label: string };

/**
 * Create-Site form (editing moved to the per-card forms in edit-site-cards.tsx).
 * Submits to POST `/api/sites` (REST — server actions 500 on OpenNext/Workers).
 * Country is single-select: SuperAdmin / global Admins
 * also get a Global option (null); a country-scoped Admin gets only their own
 * countries and no Global (the route re-enforces this).
 *
 * Slug auto-derives from name until the user edits the slug field, then it stays
 * put. The slug field sanitizes as you type (slugifyTyping) so it can never hold
 * capitals/spaces/punctuation, and a debounced GET /api/sites/slug-check shows
 * taken/available live (the route re-checks on write — this is advisory).
 * On success the form navigates to the saved Site's detail page.
 */
export function SiteForm({
  actor,
  tags,
}: {
  actor: ActorCtx;
  /** The managed org-tag vocabulary (empty → the field shows a "none yet" hint). */
  tags: TagOption[];
}) {
  const t = useTranslations("sites");
  const router = useRouter();
  const [error, setError] = useState<SiteErrorKey | null>(null);
  // Server-composed detail (currently only the oversell rejection, which needs
  // the actual dollar figures); rendered verbatim in place of the i18n string.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
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

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [country, setCountry] = useState<DefaultOption | null>(
    countryOptions.find((o) => o.id === GLOBAL_COUNTRY) ?? null,
  );
  const tagOptions: DefaultOption[] = useMemo(
    () => tags.map((tag) => ({ id: tag.id, label: tag.label })),
    [tags],
  );
  const [selectedTags, setSelectedTags] = useState<DefaultOption[]>([]);
  // Auto-derive slug from name until the user takes over the slug field.
  useEffect(() => {
    if (!slugEdited) setSlug(slugify(name));
  }, [name, slugEdited]);

  // Live uniqueness probe, debounced. `null` = nothing to show (empty/invalid/
  // unchanged-in-edit or still waiting); the create/update route re-checks.
  const [slugAvail, setSlugAvail] = useState<
    { slug: string; available: boolean } | null
  >(null);
  const [slugChecking, setSlugChecking] = useState(false);
  useEffect(() => {
    const candidate = slugify(slug);
    setSlugAvail(null);
    if (!isValidSlug(candidate)) { setSlugChecking(false); return; }
    setSlugChecking(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ slug: candidate });
        const res = await fetch(`/api/sites/slug-check?${q}`, { signal: ctrl.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { slug: string; available: boolean };
        setSlugAvail({ slug: data.slug, available: data.available });
      } catch {
        /* aborted / offline — stay silent, the route decides on submit */
      } finally {
        if (!ctrl.signal.aborted) setSlugChecking(false);
      }
    }, 350);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [slug]);
  const slugTakenLive = slugAvail !== null && slugAvail.slug === slugify(slug) && !slugAvail.available;

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
    setErrorMessage(null);
    setPending(true);
    const payload: Record<string, unknown> = {
      name,
      slug,
      country: countryValue,
      tagIds: selectedTags.map((tag) => String(tag.id)),
    };
    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: SiteErrorKey;
        message?: string;
        savedId?: string;
      };
      if (res.ok && data.savedId) {
        setSavedId(data.savedId);
        return;
      }
      setError(data.error ?? "unknown");
      setErrorMessage(data.message ?? null);
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
    ["notAllowed", "countryNotAllowed", "notFound", "oversell", "unknown"].includes(
      error,
    )
      ? (errorMessage ?? t(`errors.${error}`))
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
            // Sanitize as typed — the field can never hold an invalid slug.
            setSlugEdited(true);
            setSlug(slugifyTyping(e.target.value));
          }}
          onBlur={() => setSlug((v) => slugify(v))}
          className="font-mono text-sm"
          aria-invalid={
            error === "slugRequired" ||
            error === "slugInvalid" ||
            error === "slugTaken" ||
            slugTakenLive
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
        ) : slugTakenLive ? (
          <FieldError>{t("errors.slugTaken")}</FieldError>
        ) : slugAvail?.available && slugAvail.slug === slugify(slug) ? (
          <FieldHint>
            <span className="text-success">{t("form.slugAvailable")}</span>
          </FieldHint>
        ) : slugChecking ? (
          <FieldHint>{t("form.slugChecking")}</FieldHint>
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

      <Field>
        <FieldLabel htmlFor="site-tags">{t("form.tags")}</FieldLabel>
        {tags.length === 0 ? (
          <FieldHint>{t("form.tagsNone")}</FieldHint>
        ) : (
          <>
            <Combobox<DefaultOption>
              id="site-tags"
              multiple
              options={tagOptions}
              value={selectedTags}
              onChange={setSelectedTags}
              searchable={tagOptions.length > 6}
              placeholder={t("form.tagsPlaceholder")}
            />
            <FieldHint>{t("form.tagsHint")}</FieldHint>
          </>
        )}
      </Field>

      <div className="flex items-center gap-2">
        <Button
          type="submit"
          loading={pending}
          disabled={pending || slugTakenLive}
          className="w-fit"
        >
          {t("form.create")}
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
