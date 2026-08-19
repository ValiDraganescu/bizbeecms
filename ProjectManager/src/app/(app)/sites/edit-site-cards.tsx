"use client";

/**
 * The three edit cards of the Site settings page (rescoped from the old single
 * "Edit Site" form):
 *
 *  - GeneralForm  — name + slug
 *  - ScopingForm  — country + org tags + assigned users ("User scoping")
 *  - LimitsForm   — AI credits quota + build-timeout override ("AI & build")
 *
 * Site fields save via PATCH `/api/sites/<id>` (REST — server actions 500 on
 * OpenNext/Workers). The PATCH body is always the FULL site shape, so each card
 * fills the fields it does not own from `current` (the server-rendered values);
 * saving one card never clears another's stored values. ScopingForm also PUTs
 * `/tags` and `/users` — one button, three requests.
 */

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

/** The Site's current stored values — the base of every PATCH body. */
export type SiteCurrent = {
  name: string;
  slug: string;
  country: CountryCode | null;
  monthlyLimitUsd: number | null;
  buildTimeoutMin: number | null;
};

/** Wire value for the country field ("GLOBAL" for null). */
function wireCountry(country: CountryCode | null | string): string {
  return country == null || country === GLOBAL_COUNTRY ? "GLOBAL" : String(country);
}

/** Full PATCH body from the stored values, with one card's overrides on top. */
function patchBody(current: SiteCurrent, overrides: Record<string, unknown>) {
  return {
    name: current.name,
    slug: current.slug,
    country: wireCountry(current.country),
    openrouterMonthlyLimitUsd: current.monthlyLimitUsd,
    buildTimeoutMin: current.buildTimeoutMin,
    ...overrides,
  };
}

type PatchResult =
  | { ok: true }
  | { ok: false; error: SiteErrorKey; message?: string };

async function patchSite(
  siteId: string,
  body: Record<string, unknown>,
): Promise<PatchResult> {
  try {
    const res = await fetch(`/api/sites/${siteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true };
    const data = (await res.json().catch(() => ({}))) as {
      error?: SiteErrorKey;
      message?: string;
    };
    return { ok: false, error: data.error ?? "unknown", message: data.message };
  } catch {
    return { ok: false, error: "unknown" };
  }
}

/* ------------------------------------------------------------------ */
/* General — name + slug                                               */
/* ------------------------------------------------------------------ */

export function GeneralForm({
  siteId,
  current,
}: {
  siteId: string;
  current: SiteCurrent;
}) {
  const t = useTranslations("sites");
  const router = useRouter();
  const [name, setName] = useState(current.name);
  const [slug, setSlug] = useState(current.slug);
  const [error, setError] = useState<SiteErrorKey | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  // Live slug-availability probe, debounced (advisory — the route re-checks).
  const [slugAvail, setSlugAvail] = useState<
    { slug: string; available: boolean } | null
  >(null);
  const [slugChecking, setSlugChecking] = useState(false);
  useEffect(() => {
    const candidate = slugify(slug);
    setSlugAvail(null);
    if (!isValidSlug(candidate) || candidate === current.slug) {
      setSlugChecking(false);
      return;
    }
    setSlugChecking(true);
    const id = setTimeout(() => {
      fetch(
        `/api/sites/slug-check?${new URLSearchParams({ slug: candidate, exclude: siteId })}`,
      )
        .then((r) =>
          r.ok
            ? (r.json() as Promise<{ available: boolean }>)
            : Promise.reject(),
        )
        .then((d) => setSlugAvail({ slug: candidate, available: d.available }))
        .catch(() => setSlugAvail(null))
        .finally(() => setSlugChecking(false));
    }, 350);
    return () => clearTimeout(id);
  }, [slug, current.slug, siteId]);

  const slugTakenLive =
    slugAvail !== null &&
    !slugAvail.available &&
    slugAvail.slug === slugify(slug);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    const result = await patchSite(
      siteId,
      patchBody(current, { name: name.trim(), slug: slugify(slug) }),
    );
    setPending(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(result.error);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col gap-4" noValidate>
      {saved ? (
        <Alert tone="success">
          <AlertBody>{t("form.savedGeneral")}</AlertBody>
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger">
          <AlertBody>{t(`errors.${error}`)}</AlertBody>
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
      </Field>

      <Field>
        <FieldLabel htmlFor="site-slug">{t("form.slug")}</FieldLabel>
        <Input
          id="site-slug"
          name="slug"
          required
          value={slug}
          onChange={(e) => setSlug(slugifyTyping(e.target.value))}
          onBlur={() => setSlug((v) => slugify(v))}
          className="font-mono text-sm"
          aria-invalid={
            error === "slugRequired" ||
            error === "slugInvalid" ||
            error === "slugTaken" ||
            slugTakenLive
          }
        />
        {slugTakenLive ? (
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

      <div className="mt-auto">
        <Button
          type="submit"
          loading={pending}
          disabled={pending || slugTakenLive}
          className="w-fit"
        >
          {t("form.save")}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* User scoping — country + tags + assigned users                      */
/* ------------------------------------------------------------------ */

export type ScopingTagOption = { id: string; label: string };
export type ScopingUserOption = { id: string; email: string };

export function ScopingForm({
  siteId,
  actor,
  current,
  tags,
  assignedTagIds,
  assignableUsers,
  assignedUserIds,
}: {
  siteId: string;
  actor: ActorCtx;
  current: SiteCurrent;
  tags: ScopingTagOption[];
  assignedTagIds: string[];
  assignableUsers: ScopingUserOption[];
  assignedUserIds: string[];
}) {
  const t = useTranslations("sites");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  const canBeGlobal =
    actor.role === "SuperAdmin" || actor.countries.length === 0;
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

  const [country, setCountry] = useState<DefaultOption | null>(
    () =>
      countryOptions.find((o) =>
        current.country == null
          ? o.id === GLOBAL_COUNTRY
          : o.id === current.country,
      ) ?? null,
  );

  const tagOptions: DefaultOption[] = useMemo(
    () => tags.map((tag) => ({ id: tag.id, label: tag.label })),
    [tags],
  );
  const [selectedTags, setSelectedTags] = useState<DefaultOption[]>(() =>
    tagOptions.filter((o) => assignedTagIds.includes(String(o.id))),
  );

  const userOptions: DefaultOption[] = useMemo(
    () => assignableUsers.map((u) => ({ id: u.id, label: u.email })),
    [assignableUsers],
  );
  const [selectedUsers, setSelectedUsers] = useState<DefaultOption[]>(() =>
    userOptions.filter((o) => assignedUserIds.includes(String(o.id))),
  );

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    setPending(true);
    try {
      // Three endpoints, one gesture. Country via the site PATCH; tags and
      // users via their replace-the-set PUTs. Run in parallel; report the
      // first failure (each route is idempotent, so a retry is safe).
      const [siteRes, tagsRes, usersRes] = await Promise.all([
        patchSite(
          siteId,
          patchBody(current, { country: wireCountry(country?.id ?? null) }),
        ),
        fetch(`/api/sites/${siteId}/tags`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tagIds: selectedTags.map((tag) => String(tag.id)),
          }),
        }).catch(() => null),
        fetch(`/api/sites/${siteId}/users`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userIds: selectedUsers.map((u) => String(u.id)),
          }),
        }).catch(() => null),
      ]);

      if (!siteRes.ok) {
        setError(siteRes.error);
      } else if (!tagsRes || !tagsRes.ok) {
        const data = tagsRes
          ? ((await tagsRes.json().catch(() => ({}))) as { error?: string })
          : {};
        setError(data.error ?? "unknown");
      } else if (!usersRes || !usersRes.ok) {
        const data = usersRes
          ? ((await usersRes.json().catch(() => ({}))) as { error?: string })
          : {};
        setError(data.error ?? "unknown");
      } else {
        setSaved(true);
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col gap-4" noValidate>
      {saved ? (
        <Alert tone="success">
          <AlertBody>{t("scoping.saved")}</AlertBody>
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger">
          <AlertBody>{t(`errors.${error}`)}</AlertBody>
        </Alert>
      ) : null}

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
        <FieldHint>
          {canBeGlobal
            ? t("form.countryHintGlobal")
            : t("form.countryHintScoped")}
        </FieldHint>
      </Field>

      <Field>
        <FieldLabel htmlFor="site-tags">{t("tags.label")}</FieldLabel>
        {tags.length === 0 ? (
          <FieldHint>{t("tags.none")}</FieldHint>
        ) : (
          <>
            <Combobox<DefaultOption>
              id="site-tags"
              multiple
              options={tagOptions}
              value={selectedTags}
              onChange={setSelectedTags}
              searchable={tagOptions.length > 6}
              placeholder={t("tags.placeholder")}
            />
            <FieldHint>{t("tags.description")}</FieldHint>
          </>
        )}
      </Field>

      <Field>
        <FieldLabel htmlFor="site-users">{t("assign.label")}</FieldLabel>
        {assignableUsers.length === 0 ? (
          <FieldHint>{t("assign.noneAssignable")}</FieldHint>
        ) : (
          <>
            <Combobox<DefaultOption>
              id="site-users"
              multiple
              options={userOptions}
              value={selectedUsers}
              onChange={setSelectedUsers}
              searchable={userOptions.length > 6}
              placeholder={t("assign.placeholder")}
            />
            <FieldHint>{t("assign.description")}</FieldHint>
          </>
        )}
      </Field>

      <div className="mt-auto">
        <Button type="submit" loading={pending} className="w-fit">
          {t("scoping.save")}
        </Button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */
/* AI & build — credits quota + build-timeout override                 */
/* ------------------------------------------------------------------ */

export function LimitsForm({
  siteId,
  current,
  hasMintedOpenrouterKey = false,
  globalBuildTimeoutMin,
}: {
  siteId: string;
  current: SiteCurrent;
  /** Whether a legacy per-Site OpenRouter key exists (never the key itself). */
  hasMintedOpenrouterKey?: boolean;
  /** The current global build timeout (min), shown as the field default. */
  globalBuildTimeoutMin?: number;
}) {
  const t = useTranslations("sites");
  const tSettings = useTranslations("settings.siteOverride");
  const router = useRouter();
  const [monthlyLimit, setMonthlyLimit] = useState(
    current.monthlyLimitUsd == null ? "" : String(current.monthlyLimitUsd),
  );
  const [buildTimeout, setBuildTimeout] = useState(
    current.buildTimeoutMin == null ? "" : String(current.buildTimeoutMin),
  );
  const [error, setError] = useState<SiteErrorKey | null>(null);
  // Server-composed detail (the oversell rejection carries dollar figures).
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  // Legacy minted key: track locally so the delete button hides after revoke.
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

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setErrorMessage(null);
    setSaved(false);
    setPending(true);
    const limit = monthlyLimit.trim();
    const bt = buildTimeout.trim();
    const result = await patchSite(
      siteId,
      patchBody(current, {
        openrouterMonthlyLimitUsd: limit === "" ? null : Number(limit),
        buildTimeoutMin: bt === "" ? null : Number(bt),
      }),
    );
    setPending(false);
    if (result.ok) {
      setSaved(true);
      router.refresh();
    } else {
      setError(result.error);
      if (result.message) setErrorMessage(result.message);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex h-full flex-col gap-4" noValidate>
      {saved ? (
        <Alert tone="success">
          <AlertBody>{t("limits.saved")}</AlertBody>
        </Alert>
      ) : null}
      {error ? (
        <Alert tone="danger">
          <AlertBody>{errorMessage ?? t(`errors.${error}`)}</AlertBody>
        </Alert>
      ) : null}

      <Field>
        <FieldLabel htmlFor="site-ai-quota">{t("form.aiQuota")}</FieldLabel>
        <Input
          id="site-ai-quota"
          name="openrouterMonthlyLimitUsd"
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={monthlyLimit}
          onChange={(e) => setMonthlyLimit(e.target.value)}
          placeholder={t("form.aiQuotaPlaceholder")}
          className="font-mono text-sm"
        />
        <FieldHint>{t("form.aiQuotaHint")}</FieldHint>

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

      <Field>
        <FieldLabel htmlFor="site-build-timeout">
          {tSettings("label")}
        </FieldLabel>
        <Input
          id="site-build-timeout"
          name="buildTimeoutMin"
          type="number"
          min={1}
          max={60}
          step={1}
          inputMode="numeric"
          value={buildTimeout}
          onChange={(e) => setBuildTimeout(e.target.value)}
          placeholder={
            globalBuildTimeoutMin != null
              ? tSettings("placeholderGlobal", { min: globalBuildTimeoutMin })
              : undefined
          }
          className="w-40 font-mono text-sm"
        />
        <FieldHint>{tSettings("hint")}</FieldHint>
      </Field>

      <div className="mt-auto">
        <Button type="submit" loading={pending} className="w-fit">
          {t("limits.save")}
        </Button>
      </div>
    </form>
  );
}
