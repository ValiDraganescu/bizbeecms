"use client";

/**
 * content-collections — Slice 5: per-collection item manager (NON-AI surface).
 *
 * For ONE collection (identified by its content_<slug> table name):
 *  - lists items via the Slice-4 structured query route (GET .../[name]/query)
 *    with a text-search box + a sort picker (filter/sort wired to the compiler);
 *  - creates/edits an item with the CORRECT input per field type (field-input.tsx),
 *    POST .../[name]/items  /  PATCH .../[name]/items/[id];
 *  - archive/unarchive (PATCH {_op}) + delete, each behind an in-app confirm modal;
 *  - adds a new field to the schema (ADD-ONLY, PATCH /api/collections/[name]).
 *
 * REST-only, purpose tokens, EN/FI/ET. No form lib.
 * Item value shapes follow the Slice-3 coercion contract (the field-input emits
 * the right shape; we omit "" so column defaults apply on create).
 */

import { useCallback, useEffect, useState, type ChangeEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { resolveLocalized, isLocaleObject } from "@/lib/render/localize";
import type { CollectionView } from "@/db/collection-store";
import { setActiveCollectionContext } from "@/lib/chat/collection-context";
import { COLLECTION_FIELD_TYPES, isTranslatableField, type CollectionField } from "@/lib/content/collection-schema";
import { ITEM_STATUSES } from "@/lib/content/item-write";
import { blankValueFor, FieldInput, TranslatableFieldInput, type FieldValue } from "./field-input";
import { toLocalizedDraft, mergeItemTranslations, type LocalizedDraft } from "@/lib/content/item-locale-fields";
import { TranslateAllMissingButton, TranslateMissingButton } from "./bulk-translate";
import { ConfirmModal } from "./confirm-modal";

const INPUT = "rounded-md border border-border bg-surface px-3 py-2 text-foreground";

type Item = Record<string, unknown>;
type ArchivedFilter = "live" | "archived" | "all";

export function CollectionItems({
  collection: initialCollection,
  allCollections = [],
  contentLocales = [],
}: {
  collection: CollectionView;
  /** Every collection in the site — for the assistant's cross-collection context. */
  allCollections?: CollectionView[];
  /** Site content locales, default (source) first — drives the per-locale editor
   *  for translatable fields. Empty/single → the plain single input. */
  contentLocales?: string[];
}) {
  const t = useTranslations("collections");
  // The admin's active UI locale (en/fi/et) — used to pick which language of a
  // translatable field to SHOW in the item list, falling back to the content
  // default locale (the site's first content locale).
  const adminLocale = useLocale();
  const contentDefaultLocale = contentLocales[0] ?? "";
  const [collection, setCollection] = useState(initialCollection);
  const tableName = collection.tableName;

  // Publish this open collection (name + fields) + the site's collection list to
  // the AI assistant, so a chat message carries which collection is open and what
  // fields it has. Re-runs when the schema changes (Add field / manage schema).
  useEffect(() => {
    setActiveCollectionContext({
      collections: allCollections.map((c) => ({ name: c.name, tableName: c.tableName })),
      current: { name: collection.name, tableName: collection.tableName, fields: collection.fields },
    });
    return () => setActiveCollectionContext(null);
  }, [collection, allCollections]);

  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("");
  const [archived, setArchived] = useState<ArchivedFilter>("live");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState<{ id: string | null; values: Record<string, FieldValue>; slug: string; status: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [addingField, setAddingField] = useState(false);
  const [managingSchema, setManagingSchema] = useState(false);
  const [importing, setImporting] = useState(false);
  // A "Translate all missing" sweep writes items directly — lock item editing
  // (new/edit/archive/delete) while it runs so the two paths can't race.
  const [sweeping, setSweeping] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const sp = new URLSearchParams();
    if (search.trim()) sp.set("search", search.trim());
    if (sort) sp.set("sort", sort);
    sp.set("archived", archived);
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(tableName)}/query?${sp.toString()}`);
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const data = (await res.json()) as { items: Item[]; total: number };
      setItems(data.items);
      setTotal(data.total);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [tableName, search, sort, archived]);

  useEffect(() => {
    void load();
  }, [load]);

  function newDraft() {
    const values: Record<string, FieldValue> = {};
    for (const f of collection.fields) values[f.name] = blankValueFor(f.type);
    setDraft({ id: null, values, slug: "", status: "draft" });
    setError(null);
  }

  function editDraft(item: Item) {
    const values: Record<string, FieldValue> = {};
    for (const f of collection.fields) {
      const raw = item[f.name];
      // A translatable field's loaded value is a locale OBJECT (or a bare string
      // for a legacy/default-only row) — keep that shape so the per-locale editor
      // shows every language. Everything else uses the type-aware coercion.
      values[f.name] =
        isTranslatableField(f) && contentLocales.length > 1 ? toLocalizedDraft(raw) : toFieldValue(f, raw);
    }
    setDraft({
      id: String(item.id),
      values,
      slug: typeof item.slug === "string" ? item.slug : "",
      status: typeof item.status === "string" ? item.status : "draft",
    });
    setError(null);
  }

  // Set ONE field's value via a FUNCTIONAL update, so concurrent field edits (and
  // especially several fields translating at once) compose on the LATEST draft
  // instead of a stale render-time snapshot — otherwise the last onChange to
  // resolve overwrites the others and their fields come back empty.
  function setFieldValue(fieldName: string, v: FieldValue) {
    setDraft((prev) =>
      prev ? { ...prev, values: { ...prev.values, [fieldName]: v } } : prev,
    );
  }

  // Merge an /api/translate response for ONE field into the draft, computed
  // against the LATEST value of THAT field (via the functional updater). This is
  // the concurrency-safe path: two fields translating in parallel each merge into
  // their own slot off the current state, so neither clobbers the other.
  function mergeFieldTranslations(
    fieldName: string,
    translations: Record<string, Record<string, string>>,
  ) {
    setDraft((prev) => {
      if (!prev) return prev;
      const current = (prev.values[fieldName] as LocalizedDraft) ?? "";
      const merged = mergeItemTranslations(current, fieldName, translations, contentLocales);
      return { ...prev, values: { ...prev.values, [fieldName]: merged } };
    });
  }

  // Bulk "Translate missing" merge: the runner hands over PRE-VETTED slots
  // (requested field × locale only), each applied through the same per-field
  // functional merge — React batches the updates, so the draft stays coherent.
  function mergeDraftTranslations(translations: Record<string, Record<string, string>>) {
    for (const name of Object.keys(translations)) mergeFieldTranslations(name, translations);
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { slug: draft.slug, status: draft.status };
      for (const f of collection.fields) {
        const v = draft.values[f.name];
        // Omit empty values on CREATE so column defaults apply; on UPDATE send all
        // so a cleared field is written through (PATCH semantics on supplied keys).
        // "Empty" covers a bare "" and a translatable field's empty locale object.
        if (draft.id === null && isEmptyDraftValue(v)) continue;
        body[f.name] = v;
      }
      const url = draft.id
        ? `/api/collections/${encodeURIComponent(tableName)}/items/${encodeURIComponent(draft.id)}`
        : `/api/collections/${encodeURIComponent(tableName)}/items`;
      const res = await fetch(url, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      setDraft(null);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function itemOp(id: string, op: "archive" | "unarchive") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(tableName)}/items/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ _op: op }),
      });
      if (!res.ok) setError(await errorOf(res));
      else await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!pendingDelete) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/collections/${encodeURIComponent(tableName)}/items/${encodeURIComponent(pendingDelete)}`,
        { method: "DELETE" },
      );
      if (!res.ok) setError(await errorOf(res));
      else {
        setPendingDelete(null);
        await load();
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar: search + sort + archived filter */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("search")}</span>
          <input
            className={INPUT}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("sortBy")}</span>
          <select className={INPUT} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="">{t("sortDefault")}</option>
            {collection.fields.map((f) => (
              <optgroup key={f.name} label={f.label || f.name}>
                <option value={`${f.name}:asc`}>{`${f.label || f.name} ↑`}</option>
                <option value={`${f.name}:desc`}>{`${f.label || f.name} ↓`}</option>
              </optgroup>
            ))}
            <option value="created_at:desc">{t("sortNewest")}</option>
            <option value="created_at:asc">{t("sortOldest")}</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("show")}</span>
          <select className={INPUT} value={archived} onChange={(e) => setArchived(e.target.value as ArchivedFilter)}>
            <option value="live">{t("showLive")}</option>
            <option value="archived">{t("showArchived")}</option>
            <option value="all">{t("showAll")}</option>
          </select>
        </label>
        <button
          type="button"
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
          disabled={sweeping}
          onClick={newDraft}
        >
          {t("newItem")}
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-4 py-2 text-foreground"
          onClick={() => setAddingField(true)}
        >
          {t("addField")}
        </button>
        <button
          type="button"
          className="rounded-md border border-border px-4 py-2 text-foreground"
          onClick={() => setManagingSchema((v) => !v)}
        >
          {t("manageSchema")}
        </button>
        <a
          className="rounded-md border border-border px-4 py-2 text-foreground"
          href={`/api/collections/${encodeURIComponent(tableName)}/export?format=csv`}
        >
          {t("exportCsv")}
        </a>
        <a
          className="rounded-md border border-border px-4 py-2 text-foreground"
          href={`/api/collections/${encodeURIComponent(tableName)}/export?format=json`}
        >
          {t("exportJson")}
        </a>
        <button
          type="button"
          className="rounded-md border border-border px-4 py-2 text-foreground"
          onClick={() => setImporting(true)}
        >
          {t("import")}
        </button>
        <TranslateAllMissingButton
          tableName={tableName}
          fields={collection.fields}
          locales={contentLocales}
          disabled={draft !== null || busy}
          onRunningChange={setSweeping}
          onDone={() => void load()}
        />
      </div>

      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
          {error}
        </p>
      )}

      {addingField && (
        <AddFieldForm
          tableName={tableName}
          onCancel={() => setAddingField(false)}
          onAdded={(updated) => {
            setCollection(updated);
            setAddingField(false);
          }}
        />
      )}

      {managingSchema && (
        <SchemaManager
          collection={collection}
          onChanged={async (updated) => {
            setCollection(updated);
            await load();
          }}
        />
      )}

      {importing && (
        <ImportForm
          tableName={tableName}
          onCancel={() => setImporting(false)}
          onImported={async () => {
            setImporting(false);
            await load();
          }}
        />
      )}

      {draft && (
        <form
          className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDraft();
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-foreground">{draft.id ? t("editItem") : t("newItem")}</h2>
            <TranslateMissingButton
              values={draft.values}
              fields={collection.fields}
              locales={contentLocales}
              tableName={tableName}
              onMerge={mergeDraftTranslations}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm text-foreground-muted">{t("itemSlug")}</span>
              <input
                className={`${INPUT} font-mono`}
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm text-foreground-muted">{t("itemStatus")}</span>
              <select
                className={INPUT}
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
              >
                {ITEM_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            </label>
            {collection.fields.map((f) =>
              isTranslatableField(f) && contentLocales.length > 1 ? (
                <TranslatableFieldInput
                  key={f.name}
                  field={f}
                  value={(draft.values[f.name] as LocalizedDraft) ?? ""}
                  locales={contentLocales}
                  tableName={tableName}
                  onChange={(v) => setFieldValue(f.name, v)}
                  onMergeTranslations={(translations) => mergeFieldTranslations(f.name, translations)}
                />
              ) : (
                <FieldInput
                  key={f.name}
                  field={f}
                  value={draft.values[f.name] ?? blankValueFor(f.type)}
                  onChange={(v) => setFieldValue(f.name, v)}
                />
              ),
            )}
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={busy}
            >
              {busy ? t("saving") : t("save")}
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-foreground"
              onClick={() => setDraft(null)}
              disabled={busy}
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

      <p className="text-sm text-foreground-muted">{t("itemCount", { count: total })}</p>

      {items.length === 0 ? (
        <p className="text-foreground-muted">{t("noItems")}</p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-border">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-raised text-foreground-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{t("itemSlug")}</th>
                {collection.fields.slice(0, 4).map((f) => (
                  <th key={f.name} className="px-3 py-2 font-medium">
                    {f.label || f.name}
                  </th>
                ))}
                <th className="px-3 py-2 font-medium">{t("itemStatus")}</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const id = String(it.id);
                const isArchived = it.archived_at != null;
                return (
                  <tr key={id} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-foreground-muted">{String(it.slug ?? "")}</td>
                    {collection.fields.slice(0, 4).map((f) => (
                      <td key={f.name} className="px-3 py-2 text-foreground">
                        {renderCell(it[f.name], adminLocale, contentDefaultLocale)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-foreground-muted">
                      {isArchived ? t("archivedTag") : String(it.status ?? "")}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40"
                          disabled={busy || sweeping}
                          onClick={() => editDraft(it)}
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40"
                          disabled={busy || sweeping}
                          onClick={() => void itemOp(id, isArchived ? "unarchive" : "archive")}
                        >
                          {isArchived ? t("unarchive") : t("archive")}
                        </button>
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-danger disabled:opacity-40"
                          disabled={busy || sweeping}
                          onClick={() => setPendingDelete(id)}
                        >
                          {t("delete")}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pendingDelete && (
        <ConfirmModal
          message={t("confirmDeleteItem")}
          confirmLabel={t("delete")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}

/** Inline import form: paste CSV/JSON or pick a file, bulk-create items. */
function ImportForm({
  tableName,
  onCancel,
  onImported,
}: {
  tableName: string;
  onCancel: () => void;
  onImported: () => void;
}) {
  const t = useTranslations("collections");
  const [format, setFormat] = useState<"csv" | "json">("csv");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; failed: number; errors: { row: number; error: string }[] } | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(tableName)}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format, text }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const data = (await res.json()) as { created: number; failed: number; errors: { row: number; error: string }[] };
      setResult(data);
      if (data.failed === 0) {
        onImported();
        return;
      }
      // some rows failed → keep the modal open so the operator can see which.
      onImported();
      setBusy(false);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormat(file.name.toLowerCase().endsWith(".json") ? "json" : "csv");
    setText(await file.text());
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h2 className="text-lg font-semibold text-foreground">{t("importTitle")}</h2>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("importFormat")}</span>
          <select className={INPUT} value={format} onChange={(e) => setFormat(e.target.value as "csv" | "json")}>
            <option value="csv">CSV</option>
            <option value="json">JSON</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("importFile")}</span>
          <input className={INPUT} type="file" accept=".csv,.json,text/csv,application/json" onChange={(e) => void onFile(e)} />
        </label>
      </div>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">{t("importPaste")}</span>
        <textarea
          className={`${INPUT} font-mono text-sm`}
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t("importPlaceholder")}
        />
      </label>
      {result && (
        <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-foreground">
          <p>{t("importResult", { created: result.created, failed: result.failed })}</p>
          {result.errors.length > 0 && (
            <ul className="mt-1 list-disc pl-5 text-danger">
              {result.errors.slice(0, 20).map((er) => (
                <li key={er.row}>{t("importRowError", { row: er.row, error: er.error })}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
        >
          {busy ? t("importing") : t("import")}
        </button>
        <button type="button" className="rounded-md border border-border px-4 py-2 text-foreground" onClick={onCancel}>
          {t("close")}
        </button>
      </div>
    </form>
  );
}

/** Inline "add a field" form (ADD-ONLY schema evolution). */
function AddFieldForm({
  tableName,
  onCancel,
  onAdded,
}: {
  tableName: string;
  onCancel: () => void;
  onAdded: (updated: CollectionView) => void;
}) {
  const t = useTranslations("collections");
  const [name, setName] = useState("");
  const [type, setType] = useState<CollectionField["type"]>("string");
  const [required, setRequired] = useState(false);
  const [options, setOptions] = useState("");
  const [translatable, setTranslatable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsOptions = type === "select" || type === "multiselect";
  const canTranslate = isTranslatableField({ type, translatable: true });

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const field: CollectionField = { name: name.trim(), type };
      if (required) field.required = true;
      if (needsOptions && options.trim()) {
        field.options = options.split(",").map((s) => s.trim()).filter(Boolean).map((v) => ({ value: v, label: v }));
      }
      if (translatable && canTranslate) field.translatable = true;
      const res = await fetch(`/api/collections/${encodeURIComponent(tableName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ field }), // route reads obj.field (add-field path)
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      onAdded((await res.json()) as CollectionView);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">{t("fieldName")}</span>
        <input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} placeholder={t("fieldNamePlaceholder")} />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">{t("fieldType")}</span>
        <select
          className={INPUT}
          value={type}
          onChange={(e) => {
            const next = e.target.value as CollectionField["type"];
            setType(next);
            // A non-text type can't be translatable — clear a stale flag.
            if (!isTranslatableField({ type: next, translatable: true })) setTranslatable(false);
          }}
        >
          {[...COLLECTION_FIELD_TYPES].map((ty) => (
            <option key={ty} value={ty}>
              {ty}
            </option>
          ))}
        </select>
      </label>
      {needsOptions && (
        <label className="flex flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("fieldOptions")}</span>
          <input className={INPUT} value={options} onChange={(e) => setOptions(e.target.value)} placeholder={t("fieldOptionsPlaceholder")} />
        </label>
      )}
      <label className="flex items-center gap-1 text-sm text-foreground">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {t("required")}
      </label>
      {canTranslate && (
        <label className="flex items-center gap-1 text-sm text-foreground" title={t("translatableHint")}>
          <input type="checkbox" checked={translatable} onChange={(e) => setTranslatable(e.target.checked)} />
          {t("translatable")}
        </label>
      )}
      {error && <p className="w-full text-danger">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50" disabled={busy || !name.trim()}>
          {busy ? t("saving") : t("addField")}
        </button>
        <button type="button" className="rounded-md border border-border px-4 py-2 text-foreground" onClick={onCancel} disabled={busy}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

/**
 * Schema manager: lists fields, with RENAME (inline) + DROP (confirm modal) per
 * field. Both go through the safe table-rebuild path (PATCH _op:rename_field |
 * drop_field on /api/collections/[name]). System columns aren't user fields, so
 * they never appear here. NO native confirm()/prompt() — in-app modal + inline form.
 */
function SchemaManager({
  collection,
  onChanged,
}: {
  collection: CollectionView;
  onChanged: (updated: CollectionView) => void | Promise<void>;
}) {
  const t = useTranslations("collections");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameTo, setRenameTo] = useState("");
  const [pendingDrop, setPendingDrop] = useState<string | null>(null);

  async function patchOp(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/collections/${encodeURIComponent(collection.tableName)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return false;
      }
      await onChanged((await res.json()) as CollectionView);
      return true;
    } catch (err) {
      setError((err as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4">
      <h2 className="text-lg font-semibold text-foreground">{t("schemaFields")}</h2>
      {error && <p className="text-danger">{error}</p>}
      {collection.fields.length === 0 ? (
        <p className="text-foreground-muted">{t("fieldCount", { count: 0 })}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {collection.fields.map((f) => (
            <li key={f.name} className="flex flex-wrap items-center gap-3 border-t border-border pt-2 first:border-t-0 first:pt-0">
              <span className="font-mono text-foreground">{f.name}</span>
              <span className="text-xs text-foreground-muted">{f.type}</span>
              <div className="ml-auto flex gap-2">
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40"
                  disabled={busy}
                  onClick={() => {
                    setRenaming(f.name);
                    setRenameTo(f.name);
                  }}
                >
                  {t("renameField")}
                </button>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-danger disabled:opacity-40"
                  disabled={busy}
                  onClick={() => setPendingDrop(f.name)}
                >
                  {t("dropField")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {renaming && (
        <ConfirmModal
          title={t("renameFieldTitle", { name: renaming })}
          confirmLabel={t("rename")}
          cancelLabel={t("cancel")}
          busy={busy}
          onConfirm={async () => {
            const to = renameTo.trim();
            if (!to || to === renaming) {
              setRenaming(null);
              return;
            }
            if (await patchOp({ _op: "rename_field", field: renaming, to })) setRenaming(null);
          }}
          onCancel={() => setRenaming(null)}
        >
          <label className="flex flex-col gap-1">
            <span className="text-xs text-foreground-muted">{t("newFieldName")}</span>
            <input
              className={INPUT}
              value={renameTo}
              onChange={(e) => setRenameTo(e.target.value)}
              placeholder={t("fieldNamePlaceholder")}
            />
          </label>
        </ConfirmModal>
      )}

      {pendingDrop && (
        <ConfirmModal
          message={t("confirmDropField", { name: pendingDrop })}
          confirmLabel={t("dropField")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={async () => {
            if (await patchOp({ _op: "drop_field", field: pendingDrop })) setPendingDrop(null);
          }}
          onCancel={() => setPendingDrop(null)}
        />
      )}
    </div>
  );
}

function renderCell(v: unknown, locale: string, defaultLocale: string): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "✓" : "—";
  // A translatable field is a locale object here — show the admin's active locale
  // (falling back to the content default), NOT "[object Object]".
  if (isLocaleObject(v)) {
    v = resolveLocalized(v, locale, defaultLocale);
    if (v == null) return "";
  }
  if (Array.isArray(v)) return v.join(", ");
  const s = String(v);
  // multiselect is stored as a JSON array string — show it readably.
  if (s.startsWith("[") && s.endsWith("]")) {
    try {
      const arr = JSON.parse(s);
      if (Array.isArray(arr)) return arr.join(", ");
    } catch {
      /* not JSON */
    }
  }
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}

/** Coerce a stored value back into the field-input's expected shape for editing. */
/** Whether a draft value is "empty" for the CREATE-skip (so column defaults
 *  apply): a bare "", an empty array, or a translatable field's empty/all-blank
 *  locale object. Booleans/numbers/non-empty text are never empty. */
function isEmptyDraftValue(v: FieldValue): boolean {
  if (v === "" || v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v).every((x) => x === "" || x == null);
  return false;
}

function toFieldValue(field: CollectionField, raw: unknown): FieldValue {
  if (field.type === "bool" || field.type === "boolean") return Boolean(raw);
  if (field.type === "multiselect") {
    if (Array.isArray(raw)) return raw.map(String);
    if (typeof raw === "string" && raw.trim()) {
      try {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) return arr.map(String);
      } catch {
        /* fall through */
      }
    }
    return [];
  }
  return raw == null ? "" : String(raw);
}

async function errorOf(res: Response): Promise<string> {
  try {
    const j = (await res.json()) as { error?: string };
    if (j.error) return j.error;
  } catch {
    /* non-JSON body */
  }
  return `HTTP ${res.status}`;
}
