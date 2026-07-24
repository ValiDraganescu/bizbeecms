"use client";

/**
 * content-collections — Slice 5: per-collection item manager (NON-AI surface).
 *
 * The ORCHESTRATOR for one collection (identified by its content_<slug> table
 * name): owns the list/query state, the open draft and the shared busy flag,
 * and wires the extracted pieces together:
 *  - toolbar (search/sort/archived + actions, inline below);
 *  - `ItemsTable` — the list, via the Slice-4 structured query route;
 *  - `ItemEditForm` — create/edit with the correct input per field type,
 *    POST .../[name]/items  /  PATCH .../[name]/items/[id];
 *  - archive/unarchive (PATCH {_op}) + delete behind an in-app confirm modal;
 *  - `AddFieldForm` / `SchemaManager` / `ImportForm` — schema + bulk import.
 *
 * REST-only, purpose tokens, EN/FI/ET. No form lib. Item value shapes follow
 * the Slice-3 coercion contract (see item-edit-form.tsx).
 */

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { CollectionView } from "@/db/collection-store";
import { setActiveCollectionContext } from "@/lib/chat/collection-context";
import { errorOf } from "@/lib/api-error";
import { AddFieldForm } from "./add-field-form";
import { TranslateAllMissingButton } from "./bulk-translate";
import { ConfirmModal } from "./confirm-modal";
import { INPUT } from "./field-input";
import { ImportForm } from "./import-form";
import { draftToItemBody, ItemEditForm, itemToDraft, newItemDraft, type ItemDraft } from "./item-edit-form";
import { ItemsTable } from "./items-table";
import { SchemaManager } from "./schema-manager";

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

  const [draft, setDraft] = useState<ItemDraft | null>(null);
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

  async function saveDraft() {
    if (!draft) return;
    setBusy(true);
    setError(null);
    try {
      const url = draft.id
        ? `/api/collections/${encodeURIComponent(tableName)}/items/${encodeURIComponent(draft.id)}`
        : `/api/collections/${encodeURIComponent(tableName)}/items`;
      const res = await fetch(url, {
        method: draft.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draftToItemBody(draft, collection.fields)),
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
          onClick={() => {
            setDraft(newItemDraft(collection.fields));
            setError(null);
          }}
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
        <ItemEditForm
          draft={draft}
          fields={collection.fields}
          locales={contentLocales}
          tableName={tableName}
          busy={busy}
          onChange={(update) => setDraft((prev) => (prev ? update(prev) : prev))}
          onSubmit={() => void saveDraft()}
          onCancel={() => setDraft(null)}
        />
      )}

      <p className="text-sm text-foreground-muted">{t("itemCount", { count: total })}</p>

      <ItemsTable
        items={items}
        fields={collection.fields}
        contentDefaultLocale={contentLocales[0] ?? ""}
        disabled={busy || sweeping}
        onEdit={(item) => {
          setDraft(itemToDraft(item, collection.fields, contentLocales));
          setError(null);
        }}
        onToggleArchive={(id, isArchived) => void itemOp(id, isArchived ? "unarchive" : "archive")}
        onDelete={setPendingDelete}
      />

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
