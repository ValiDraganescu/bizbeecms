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

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CollectionView } from "@/db/collection-store";
import { COLLECTION_FIELD_TYPES, type CollectionField } from "@/lib/content/collection-schema";
import { ITEM_STATUSES } from "@/lib/content/item-write";
import { blankValueFor, FieldInput, type FieldValue } from "./field-input";
import { ConfirmModal } from "./confirm-modal";

const INPUT = "rounded-md border border-border bg-surface px-3 py-2 text-foreground";

type Item = Record<string, unknown>;
type ArchivedFilter = "live" | "archived" | "all";

export function CollectionItems({ collection: initialCollection }: { collection: CollectionView }) {
  const t = useTranslations("collections");
  const [collection, setCollection] = useState(initialCollection);
  const tableName = collection.tableName;

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
      values[f.name] = toFieldValue(f, raw);
    }
    setDraft({
      id: String(item.id),
      values,
      slug: typeof item.slug === "string" ? item.slug : "",
      status: typeof item.status === "string" ? item.status : "draft",
    });
    setError(null);
  }

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { slug: draft.slug, status: draft.status };
      for (const f of collection.fields) {
        const v = draft.values[f.name];
        // Omit empty strings on CREATE so column defaults apply; on UPDATE send all
        // so a cleared field is written through (PATCH semantics on supplied keys).
        if (v === "" && draft.id === null) continue;
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
          className="rounded-md bg-primary px-4 py-2 text-primary-foreground"
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

      {draft && (
        <form
          className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void saveDraft();
          }}
        >
          <h2 className="text-lg font-semibold text-foreground">{draft.id ? t("editItem") : t("newItem")}</h2>

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
            {collection.fields.map((f) => (
              <FieldInput
                key={f.name}
                field={f}
                value={draft.values[f.name] ?? blankValueFor(f.type)}
                onChange={(v) => setDraft({ ...draft, values: { ...draft.values, [f.name]: v } })}
              />
            ))}
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
                        {renderCell(it[f.name])}
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
                          disabled={busy}
                          onClick={() => editDraft(it)}
                        >
                          {t("edit")}
                        </button>
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground disabled:opacity-40"
                          disabled={busy}
                          onClick={() => void itemOp(id, isArchived ? "unarchive" : "archive")}
                        >
                          {isArchived ? t("unarchive") : t("archive")}
                        </button>
                        <button
                          type="button"
                          className="rounded border border-border px-2 py-1 text-danger disabled:opacity-40"
                          disabled={busy}
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsOptions = type === "select" || type === "multiselect";

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const field: CollectionField = { name: name.trim(), type };
      if (required) field.required = true;
      if (needsOptions && options.trim()) {
        field.options = options.split(",").map((s) => s.trim()).filter(Boolean).map((v) => ({ value: v, label: v }));
      }
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
        <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as CollectionField["type"])}>
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

function renderCell(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "boolean") return v ? "✓" : "—";
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
