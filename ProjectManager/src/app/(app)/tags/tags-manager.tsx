"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  Button,
  ConfirmDialog,
  Field,
  FieldError,
  FieldLabel,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui";
import type { TagErrorKey } from "@/app/api/tags/route";

type TagRow = { id: string; label: string };

/**
 * Tag CRUD surface (pm-roles Slice 3b). Add via the inline form; rename inline;
 * delete behind an IN-APP confirm modal (never window.confirm — see CAVEATS).
 * The API is the real authz gate; this is Admin+ chrome.
 */
export function TagsManager({ initialTags }: { initialTags: TagRow[] }) {
  const t = useTranslations("tags");
  const [tags, setTags] = useState<TagRow[]>(initialTags);
  const [newLabel, setNewLabel] = useState("");
  const [addError, setAddError] = useState<TagErrorKey | null>(null);
  const [pending, setPending] = useState(false);

  // Inline rename state.
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editError, setEditError] = useState<TagErrorKey | null>(null);

  // Delete-confirm modal target.
  const [confirmTag, setConfirmTag] = useState<TagRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const errMsg = (key: TagErrorKey) => t(`errors.${key}`);

  async function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setAddError(null);
    setPending(true);
    try {
      const res = await fetch("/api/tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newLabel }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        tag?: TagRow;
        error?: TagErrorKey;
      };
      if (res.ok && data.tag) {
        setTags((prev) =>
          [...prev, data.tag!].sort((a, b) => a.label.localeCompare(b.label)),
        );
        setNewLabel("");
        return;
      }
      setAddError(data.error ?? "unknown");
    } catch {
      setAddError("unknown");
    } finally {
      setPending(false);
    }
  }

  function startEdit(tag: TagRow) {
    setEditingId(tag.id);
    setEditLabel(tag.label);
    setEditError(null);
  }

  async function saveEdit(id: string) {
    setEditError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/tags/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: editLabel }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        tag?: TagRow;
        error?: TagErrorKey;
      };
      if (res.ok && data.tag) {
        setTags((prev) =>
          prev
            .map((tg) => (tg.id === id ? data.tag! : tg))
            .sort((a, b) => a.label.localeCompare(b.label)),
        );
        setEditingId(null);
        return;
      }
      setEditError(data.error ?? "unknown");
    } catch {
      setEditError("unknown");
    } finally {
      setPending(false);
    }
  }

  async function confirmDelete() {
    if (!confirmTag) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/tags/${confirmTag.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setTags((prev) => prev.filter((tg) => tg.id !== confirmTag.id));
        setConfirmTag(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <form onSubmit={onAdd} className="flex flex-col gap-3">
        <Field>
          <FieldLabel htmlFor="tag-label">{t("form.label")}</FieldLabel>
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <Input
                id="tag-label"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder={t("form.placeholder")}
                aria-invalid={addError != null}
              />
              {addError ? <FieldError>{errMsg(addError)}</FieldError> : null}
            </div>
            <Button type="submit" loading={pending} className="shrink-0">
              {t("form.add")}
            </Button>
          </div>
        </Field>
      </form>

      {tags.length === 0 ? (
        <p className="text-sm text-foreground-muted">{t("list.empty")}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("list.label")}</TableHead>
              <TableHead className="text-right">{t("list.actions")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tags.map((tag) => (
              <TableRow key={tag.id}>
                <TableCell>
                  {editingId === tag.id ? (
                    <div className="flex flex-col gap-1">
                      <Input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        aria-invalid={editError != null}
                        autoFocus
                      />
                      {editError ? (
                        <FieldError>{errMsg(editError)}</FieldError>
                      ) : null}
                    </div>
                  ) : (
                    <span className="font-medium">{tag.label}</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  {editingId === tag.id ? (
                    <div className="inline-flex gap-2">
                      <Button
                        size="sm"
                        onClick={() => saveEdit(tag.id)}
                        loading={pending}
                      >
                        {t("actions.save")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(null)}
                      >
                        {t("actions.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <div className="inline-flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => startEdit(tag)}
                      >
                        {t("actions.rename")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setConfirmTag(tag)}
                      >
                        {t("actions.delete")}
                      </Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {confirmTag ? (
        <ConfirmDialog
          title={t("delete.title")}
          body={t("delete.body", { label: confirmTag.label })}
          confirmLabel={t("actions.delete")}
          cancelLabel={t("actions.cancel")}
          loading={deleting}
          onCancel={() => setConfirmTag(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}
