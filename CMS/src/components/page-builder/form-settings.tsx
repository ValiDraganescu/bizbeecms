"use client";

/**
 * Form block settings (external-data-sources Form slice (b); split out of the
 * former monolithic binding-panels.tsx): pick where the submission goes — an
 * api SAVED REQUEST (central fetch engine; secret stays server-side) or an
 * opted-in COLLECTION (visitor submissions land as DRAFT items) — via the same
 * source picker binds use. There is deliberately NO field→placeholder map
 * config: the submit endpoint matches form fields by NAME (submit-core), so the
 * panel instead SHOWS the exact input names the form's content must use.
 * Success/error messages + an optional same-site redirect ride on `formTarget`.
 * The content component is set like the List template (single child by name);
 * an AI-authored multi-child form shows its children read-only instead so the
 * select can't clobber them.
 */

import { useTranslations } from "next-intl";
import type { Block, FormTarget } from "@/lib/render/tree";
import { FORM_DEFAULT_SUCCESS, FORM_DEFAULT_ERROR } from "@/lib/render/plan-form";
import type { ApiSourceMeta, CollectionMeta } from "@/lib/page-builder/types";
import { ctlLabel, ctlInput, SpacingControls } from "./shared";
import {
  API_PREFIX,
  COLLECTION_PREFIX,
  RequestSelect,
  SourceSelect,
  placeholdersOf,
} from "./binding-controls";

export function FormSettings({
  block,
  collections,
  apiSources,
  propsSchemas,
  onChange,
  onProps,
}: {
  block: Block;
  collections: CollectionMeta[];
  apiSources: ApiSourceMeta[];
  propsSchemas: Record<string, string | null>;
  onChange: (patch: { formTarget?: FormTarget; __child?: Block[] }) => void;
  onProps: (patch: Record<string, unknown>) => void;
}) {
  const t = useTranslations("pageBuilder");
  const target = block.formTarget;
  const kind = target?.kind;
  const collection = target?.collection ?? "";
  const meta = collections.find((c) => c.tableName === collection);
  const apiSourceId = target?.sourceId ?? "";
  const apiRequestId = target?.requestId ?? "";
  const apiSource = apiSources.find((s) => s.id === apiSourceId);
  const apiRequest = apiSource?.requests.find((r) => r.id === apiRequestId);

  // Form content = the block's children. v1 mirrors the List template: ONE
  // component picked by name. Multiple children (AI-authored) → read-only list.
  const children = block.children ?? [];
  const contentName = children[0]?.component ?? "";
  const componentNames = Object.keys(propsSchemas).sort();

  // The input NAMES the form's fields must use — submit maps by exact name:
  // api = the saved request's {placeholders}; collection = its schema fields.
  const fieldNames =
    kind === "api"
      ? placeholdersOf(apiRequest)
      : kind === "collection"
        ? (meta?.fields ?? []).map((f) => f.name)
        : [];

  const redirect = target?.redirect ?? "";
  const redirectInvalid = redirect !== "" && (!redirect.startsWith("/") || redirect.startsWith("//"));

  /**
   * Rebuild the target from parts. Kind-switching is destructure-based like
   * bind_form: switching drops the OTHER kind's ids; authored messages +
   * redirect always survive. No kind → untargeted (key deleted, the Form
   * renders as a plain container — graceful by design).
   */
  function emit(next: Partial<FormTarget>) {
    const merged = { ...target, ...next };
    if (!merged.kind) {
      onChange({ formTarget: undefined });
      return;
    }
    const built: FormTarget =
      merged.kind === "api"
        ? { kind: "api", sourceId: merged.sourceId, requestId: merged.requestId }
        : { kind: "collection", collection: merged.collection };
    if (merged.successMessage) built.successMessage = merged.successMessage;
    if (merged.errorMessage) built.errorMessage = merged.errorMessage;
    if (merged.redirect) built.redirect = merged.redirect;
    onChange({ formTarget: built });
  }

  return (
    <section className="space-y-3">
      <h3 className="text-sm font-semibold text-foreground">{t("form.title")}</h3>
      <SpacingControls props={block.props ?? {}} onPatch={onProps} />
      <p className="text-xs text-foreground-muted">{t("form.help")}</p>

      <SourceSelect
        value={
          kind === "api"
            ? apiSourceId
              ? `${API_PREFIX}${apiSourceId}`
              : ""
            : kind === "collection" && collection
              ? `${COLLECTION_PREFIX}${collection}`
              : ""
        }
        collections={collections}
        apiSources={apiSources}
        onPick={(v) => {
          if (!v) onChange({ formTarget: undefined });
          else if (v.startsWith(COLLECTION_PREFIX))
            emit({ kind: "collection", collection: v.slice(COLLECTION_PREFIX.length) });
          else {
            const id = v.slice(API_PREFIX.length);
            const s = apiSources.find((x) => x.id === id);
            emit({ kind: "api", sourceId: id, requestId: s?.requests[0]?.id ?? "" });
          }
        }}
      />

      {collections.length === 0 && apiSources.length === 0 && (
        <p className="text-xs text-foreground-muted">{t("bind.noSources")}</p>
      )}

      {kind === "api" && apiSourceId && (
        <RequestSelect
          source={apiSource}
          requestId={apiRequestId}
          onPick={(id) => emit({ requestId: id })}
        />
      )}

      {/* Collection opt-in guard: submissions 403 until the flag is ON. */}
      {kind === "collection" && meta && meta.publicSubmissions !== true && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-xs text-danger">
          {t("form.publicOff")}{" "}
          {/* ponytail: plain <a> (not next/link) — keeps this panel bundleable by
              the dep-free ssr-bind-panel-check script; full reload is fine here. */}
          <a href="/admin/collections" className="underline">
            {t("form.publicOffLink")}
          </a>
        </p>
      )}

      {/* The exact input names the form's content must use (mapping is BY NAME). */}
      {(kind === "api" ? Boolean(apiRequest) : kind === "collection" && Boolean(meta)) && (
        <div className="space-y-1.5">
          <span className={ctlLabel}>{t("form.fields")}</span>
          <p className="text-xs text-foreground-muted">
            {kind === "api" ? t("form.fieldsHelpApi") : t("form.fieldsHelpCollection")}
          </p>
          {fieldNames.length === 0 ? (
            <p className="text-xs text-foreground-muted">{t("form.fieldsNone")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {fieldNames.map((n) => (
                <li
                  key={n}
                  className="rounded-md border border-border bg-surface-muted px-2 py-0.5 font-mono text-xs text-foreground"
                >
                  {n}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Form content — a component whose inputs (+ its type="submit" button)
          become the form's fields, via native <form> semantics. */}
      {children.length > 1 ? (
        <div className="space-y-1.5 border-t border-border pt-4">
          <span className={ctlLabel}>{t("form.contentMulti")}</span>
          <ul className="space-y-1">
            {children.map((c) => (
              <li key={c.id} className="font-mono text-xs text-foreground">
                {c.component}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <label className="flex flex-col gap-1.5 border-t border-border pt-4">
          <span className={ctlLabel}>{t("form.content")}</span>
          <select
            className={ctlInput}
            value={contentName}
            aria-label={t("form.content")}
            onChange={(e) => {
              const name = e.target.value;
              onChange({
                __child: name ? [{ id: `${block.id}-content`, component: name }] : [],
              });
            }}
          >
            <option value="">{t("list.pickTemplate")}</option>
            {componentNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <span className="text-xs text-foreground-muted">{t("form.contentHelp")}</span>
        </label>
      )}

      {kind && (
        <div className="space-y-3 border-t border-border pt-4">
          <label className="flex flex-col gap-1.5">
            <span className={ctlLabel}>{t("form.successMessage")}</span>
            <input
              type="text"
              className={ctlInput}
              value={target?.successMessage ?? ""}
              placeholder={FORM_DEFAULT_SUCCESS}
              aria-label={t("form.successMessage")}
              onChange={(e) => emit({ successMessage: e.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={ctlLabel}>{t("form.errorMessage")}</span>
            <input
              type="text"
              className={ctlInput}
              value={target?.errorMessage ?? ""}
              placeholder={FORM_DEFAULT_ERROR}
              aria-label={t("form.errorMessage")}
              onChange={(e) => emit({ errorMessage: e.target.value })}
            />
          </label>
          <p className="text-xs text-foreground-muted">{t("form.messagesHelp")}</p>
          <label className="flex flex-col gap-1.5">
            <span className={ctlLabel}>{t("form.redirect")}</span>
            <input
              type="text"
              className={`${ctlInput} font-mono`}
              value={redirect}
              placeholder="/thank-you"
              aria-label={t("form.redirect")}
              onChange={(e) => emit({ redirect: e.target.value })}
            />
            <span className="text-xs text-foreground-muted">{t("form.redirectHint")}</span>
            {redirectInvalid && (
              <span role="alert" className="text-xs text-danger">
                {t("form.redirectInvalid")}
              </span>
            )}
          </label>
        </div>
      )}
    </section>
  );
}
