"use client";

/**
 * The collection item edit form + the item DRAFT shape it edits. Extracted from
 * collection-items.tsx (Slice 5).
 *
 * The PARENT owns the draft state (it needs `draft !== null` to lock the sweep
 * button, and its shared `busy` gates the whole page); this module owns the
 * draft's shape: the constructors (`newItemDraft` / `itemToDraft`), the save
 * body (`draftToItemBody`, CREATE omits empties so column defaults apply) and
 * the form UI. All draft mutations here go through the FUNCTIONAL `onChange`
 * updater, so concurrent field edits — and especially several fields
 * translating at once — compose on the LATEST draft instead of a stale
 * render-time snapshot.
 */

import { useTranslations } from "next-intl";
import { isTranslatableField, type CollectionField } from "@/lib/content/collection-schema";
import { ITEM_STATUSES } from "@/lib/content/item-write";
import { toLocalizedDraft, mergeItemTranslations, type LocalizedDraft } from "@/lib/content/item-locale-fields";
import { blankValueFor, FieldInput, INPUT, TranslatableFieldInput, type FieldValue } from "./field-input";
import { TranslateMissingButton } from "./bulk-translate";

export interface ItemDraft {
  /** null → creating a new item; an id → editing that item. */
  id: string | null;
  values: Record<string, FieldValue>;
  slug: string;
  status: string;
}

/** A blank draft for creating a new item. */
export function newItemDraft(fields: CollectionField[]): ItemDraft {
  const values: Record<string, FieldValue> = {};
  for (const f of fields) values[f.name] = blankValueFor(f.type);
  return { id: null, values, slug: "", status: "draft" };
}

/** A draft seeded from a loaded item row, ready for editing. */
export function itemToDraft(
  item: Record<string, unknown>,
  fields: CollectionField[],
  contentLocales: string[],
): ItemDraft {
  const values: Record<string, FieldValue> = {};
  for (const f of fields) {
    const raw = item[f.name];
    // A translatable field's loaded value is a locale OBJECT (or a bare string
    // for a legacy/default-only row) — keep that shape so the per-locale editor
    // shows every language. Everything else uses the type-aware coercion.
    values[f.name] =
      isTranslatableField(f) && contentLocales.length > 1 ? toLocalizedDraft(raw) : toFieldValue(f, raw);
  }
  return {
    id: String(item.id),
    values,
    slug: typeof item.slug === "string" ? item.slug : "",
    status: typeof item.status === "string" ? item.status : "draft",
  };
}

/** The POST/PATCH body for a draft. Omit empty values on CREATE so column
 *  defaults apply; on UPDATE send all so a cleared field is written through
 *  (PATCH semantics on supplied keys). "Empty" covers a bare "" and a
 *  translatable field's empty locale object. */
export function draftToItemBody(draft: ItemDraft, fields: CollectionField[]): Record<string, unknown> {
  const body: Record<string, unknown> = { slug: draft.slug, status: draft.status };
  for (const f of fields) {
    const v = draft.values[f.name];
    if (draft.id === null && isEmptyDraftValue(v)) continue;
    body[f.name] = v;
  }
  return body;
}

/** Whether a draft value is "empty" for the CREATE-skip: a bare "", an empty
 *  array, or a translatable field's empty/all-blank locale object.
 *  Booleans/numbers/non-empty text are never empty. */
function isEmptyDraftValue(v: FieldValue): boolean {
  if (v === "" || v == null) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.values(v).every((x) => x === "" || x == null);
  return false;
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

export function ItemEditForm({
  draft,
  fields,
  locales,
  tableName,
  busy,
  onChange,
  onSubmit,
  onCancel,
}: {
  draft: ItemDraft;
  fields: CollectionField[];
  /** Site content locales, default (source) first. */
  locales: string[];
  tableName: string;
  /** True while the parent is saving — disables Save/Cancel. */
  busy: boolean;
  /** FUNCTIONAL draft update — the concurrency-safe path (see module doc). */
  onChange: (update: (prev: ItemDraft) => ItemDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("collections");

  function setFieldValue(fieldName: string, v: FieldValue) {
    onChange((prev) => ({ ...prev, values: { ...prev.values, [fieldName]: v } }));
  }

  // Merge an /api/translate response for ONE field into the draft, computed
  // against the LATEST value of THAT field (via the functional updater). Two
  // fields translating in parallel each merge into their own slot off the
  // current state, so neither clobbers the other.
  function mergeFieldTranslations(
    fieldName: string,
    translations: Record<string, Record<string, string>>,
  ) {
    onChange((prev) => {
      const current = (prev.values[fieldName] as LocalizedDraft) ?? "";
      const merged = mergeItemTranslations(current, fieldName, translations, locales);
      return { ...prev, values: { ...prev.values, [fieldName]: merged } };
    });
  }

  // Bulk "Translate missing" merge: the runner hands over PRE-VETTED slots
  // (requested field × locale only), each applied through the same per-field
  // functional merge — React batches the updates, so the draft stays coherent.
  function mergeDraftTranslations(translations: Record<string, Record<string, string>>) {
    for (const name of Object.keys(translations)) mergeFieldTranslations(name, translations);
  }

  return (
    <form
      className="flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-foreground">{draft.id ? t("editItem") : t("newItem")}</h2>
        <TranslateMissingButton
          values={draft.values}
          fields={fields}
          locales={locales}
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
            onChange={(e) => onChange((prev) => ({ ...prev, slug: e.target.value }))}
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm text-foreground-muted">{t("itemStatus")}</span>
          <select
            className={INPUT}
            value={draft.status}
            onChange={(e) => onChange((prev) => ({ ...prev, status: e.target.value }))}
          >
            {ITEM_STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(`status.${s}`)}
              </option>
            ))}
          </select>
        </label>
        {fields.map((f) =>
          isTranslatableField(f) && locales.length > 1 ? (
            <TranslatableFieldInput
              key={f.name}
              field={f}
              value={(draft.values[f.name] as LocalizedDraft) ?? ""}
              locales={locales}
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
          onClick={onCancel}
          disabled={busy}
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
