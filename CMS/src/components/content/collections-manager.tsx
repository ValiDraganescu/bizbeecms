"use client";

/**
 * content-collections — Slice 5: collections list + schema editor (NON-AI surface).
 *
 * Lists collections (GET /api/collections), creates one (POST {name, fields[]}),
 * adds fields to an existing one (PATCH /api/collections/[tableName] {field}), and
 * deletes one behind an in-app confirm modal (DELETE /api/collections/[tableName]).
 * Field schema is built with a type picker (the Slice-1 field-type vocab). Item
 * CRUD lives on the per-collection detail page (collection-items.tsx).
 *
 * REST-only, purpose tokens, EN/FI/ET via next-intl. No form lib.
 * ponytail: schema editing is ADD-ONLY (v1, USER DECISION) — existing fields are
 * read-only; you append new ones. Drop/rename is a later phase.
 */

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  COLLECTION_FIELD_TYPES,
  type CollectionField,
  type CollectionFieldType,
} from "@/lib/content/collection-schema";
import type { CollectionView } from "@/db/collection-store";
import { ConfirmModal } from "./confirm-modal";

const FIELD_TYPES = [...COLLECTION_FIELD_TYPES] as CollectionFieldType[];
const INPUT = "rounded-md border border-border bg-surface px-3 py-2 text-foreground";
const NEEDS_OPTIONS = new Set<CollectionFieldType>(["select", "multiselect"]);

type FieldDraft = {
  name: string;
  type: CollectionFieldType;
  required: boolean;
  options: string; // comma-separated values for select/multiselect
};

function blankField(): FieldDraft {
  return { name: "", type: "string", required: false, options: "" };
}

function toCollectionField(d: FieldDraft): CollectionField {
  const f: CollectionField = { name: d.name.trim(), type: d.type };
  if (d.required) f.required = true;
  if (NEEDS_OPTIONS.has(d.type) && d.options.trim()) {
    f.options = d.options
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((value) => ({ value, label: value }));
  }
  return f;
}

export function CollectionsManager({ initial }: { initial: CollectionView[] }) {
  const t = useTranslations("collections");
  const [list, setList] = useState<CollectionView[]>(initial);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [fields, setFields] = useState<FieldDraft[]>([blankField()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<CollectionView | null>(null);

  async function refresh() {
    const res = await fetch("/api/collections");
    if (res.ok) setList((await res.json()) as CollectionView[]);
  }

  function resetForm() {
    setCreating(false);
    setName("");
    setFields([blankField()]);
    setError(null);
  }

  async function create() {
    setError(null);
    const cleanFields = fields.filter((f) => f.name.trim()).map(toCollectionField);
    setBusy(true);
    try {
      const res = await fetch("/api/collections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), fields: cleanFields }),
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      resetForm();
      await refresh();
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
      const res = await fetch(`/api/collections/${encodeURIComponent(pendingDelete.tableName)}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      setPendingDelete(null);
      await refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!creating && (
        <button
          type="button"
          className="self-start rounded-md bg-primary px-4 py-2 text-primary-foreground"
          onClick={() => setCreating(true)}
        >
          {t("new")}
        </button>
      )}

      {creating && (
        <form
          className="flex flex-col gap-4 rounded-md border border-border bg-surface-raised p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void create();
          }}
        >
          <h2 className="text-lg font-semibold text-foreground">{t("newTitle")}</h2>

          <label className="flex flex-col gap-1">
            <span className="text-sm text-foreground-muted">{t("name")}</span>
            <input
              className={INPUT}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("namePlaceholder")}
              aria-label={t("name")}
            />
          </label>

          <fieldset className="flex flex-col gap-3 border-t border-border pt-3">
            <legend className="text-sm font-medium text-foreground">{t("fields")}</legend>
            {fields.map((f, i) => (
              <FieldRow
                key={i}
                draft={f}
                onChange={(d) => setFields(fields.map((x, j) => (j === i ? d : x)))}
                onRemove={fields.length > 1 ? () => setFields(fields.filter((_, j) => j !== i)) : undefined}
              />
            ))}
            <button
              type="button"
              className="self-start rounded border border-border px-3 py-1 text-sm text-foreground-muted hover:text-foreground"
              onClick={() => setFields([...fields, blankField()])}
            >
              {t("addField")}
            </button>
          </fieldset>

          {error && (
            <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
              {error}
            </p>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={busy || !name.trim()}
            >
              {busy ? t("saving") : t("create")}
            </button>
            <button
              type="button"
              className="rounded-md border border-border px-4 py-2 text-foreground"
              onClick={resetForm}
              disabled={busy}
            >
              {t("cancel")}
            </button>
          </div>
        </form>
      )}

      {!creating && error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
          {error}
        </p>
      )}

      {list.length === 0 ? (
        <p className="text-foreground-muted">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium text-foreground">{c.name}</span>
                <span className="font-mono text-sm text-foreground-muted">
                  {c.tableName} · {t("fieldCount", { count: c.fields.length })}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Link
                  href={`/admin/collections/${encodeURIComponent(c.tableName)}`}
                  className="rounded border border-border px-2 py-1 text-foreground-muted hover:text-foreground"
                >
                  {t("manageItems")}
                </Link>
                <button
                  type="button"
                  className="rounded border border-border px-2 py-1 text-danger disabled:opacity-40"
                  disabled={busy}
                  onClick={() => setPendingDelete(c)}
                  aria-label={t("deleteOne", { name: c.name })}
                >
                  {t("delete")}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmModal
          message={t("confirmDelete", { name: pendingDelete.name })}
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

function FieldRow({
  draft,
  onChange,
  onRemove,
}: {
  draft: FieldDraft;
  onChange: (d: FieldDraft) => void;
  onRemove?: () => void;
}) {
  const t = useTranslations("collections");
  return (
    <div className="flex flex-col gap-2 rounded-md border border-border bg-surface p-3 sm:flex-row sm:items-end">
      <label className="flex flex-1 flex-col gap-1">
        <span className="text-xs text-foreground-muted">{t("fieldName")}</span>
        <input
          className={INPUT}
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          placeholder={t("fieldNamePlaceholder")}
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-xs text-foreground-muted">{t("fieldType")}</span>
        <select
          className={INPUT}
          value={draft.type}
          onChange={(e) => onChange({ ...draft, type: e.target.value as CollectionFieldType })}
        >
          {FIELD_TYPES.map((ty) => (
            <option key={ty} value={ty}>
              {ty}
            </option>
          ))}
        </select>
      </label>
      {NEEDS_OPTIONS.has(draft.type) && (
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-xs text-foreground-muted">{t("fieldOptions")}</span>
          <input
            className={INPUT}
            value={draft.options}
            onChange={(e) => onChange({ ...draft, options: e.target.value })}
            placeholder={t("fieldOptionsPlaceholder")}
          />
        </label>
      )}
      <label className="flex items-center gap-1 text-sm text-foreground">
        <input
          type="checkbox"
          checked={draft.required}
          onChange={(e) => onChange({ ...draft, required: e.target.checked })}
        />
        {t("required")}
      </label>
      {onRemove && (
        <button
          type="button"
          className="rounded border border-border px-2 py-2 text-danger"
          onClick={onRemove}
          aria-label={t("removeField")}
        >
          ✕
        </button>
      )}
    </div>
  );
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
