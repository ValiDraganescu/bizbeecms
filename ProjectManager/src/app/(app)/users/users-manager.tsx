"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Alert,
  AlertBody,
  Badge,
  Button,
  Combobox,
  Field,
  FieldError,
  FieldLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type DefaultOption,
} from "@/components/ui";
import type { Role } from "@/db/schema";
import {
  COUNTRY_CODES,
  countryNames,
  type CountryCode,
} from "@/lib/auth/countries";

const ROLES: Role[] = ["SuperAdmin", "Admin", "Manager", "Editor"];

// Mirrors lib/auth/removal.ts RANK — client-side gate only (the API is the real
// gate). Strictly-greater rank may remove/re-role; equal-or-lower may not.
const RANK: Record<Role, number> = {
  SuperAdmin: 3,
  Admin: 2,
  Manager: 1,
  Editor: 0,
};

type Actor = {
  id: string;
  role: Role;
  countries: CountryCode[];
  tagIds: string[];
};
type UserRow = {
  id: string;
  email: string;
  role: Role;
  countries: CountryCode[];
  tagIds: string[];
};
type Tag = { id: string; label: string };

// API error keys surfaced by /api/users/[id] (see users.errors namespace).
type UserErrorKey =
  | "notAllowed"
  | "notFound"
  | "roleNotAllowed"
  | "countryNotAllowed"
  | "tagNotAllowed"
  | "unknown";

/**
 * Global user-management UI (pm-roles Slice 5). Lists users; each row a manager
 * may act on (strictly outranks per RANK) gets inline Edit (role + countries +
 * tags) and Remove (in-app confirm modal). Rows at/above the actor's tier, and
 * the actor's own row, are read-only. The /api/users routes are the real gate.
 */
export function UsersManager({
  actor,
  initialUsers,
  tags,
}: {
  actor: Actor;
  initialUsers: UserRow[];
  tags: Tag[];
}) {
  const t = useTranslations("users");
  const tRoles = useTranslations("roles");
  const [users, setUsers] = useState<UserRow[]>(initialUsers);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmUser, setConfirmUser] = useState<UserRow | null>(null);
  const [deleting, setDeleting] = useState(false);

  const roleLabel = (r: Role) => tRoles(r.charAt(0).toLowerCase() + r.slice(1));
  const tagLabel = (id: string) => tags.find((tg) => tg.id === id)?.label ?? id;

  // A scoped (non-global) actor may only grant within its own scope; a global
  // actor (SuperAdmin or country-empty Admin) grants anything. Mirrors
  // manage-users.ts authorizeAssign so we don't offer options the API rejects.
  const isGlobalActor =
    actor.role === "SuperAdmin" || actor.countries.length === 0;
  const grantableCountries: CountryCode[] = isGlobalActor
    ? [...COUNTRY_CODES]
    : actor.countries;
  const grantableTags: Tag[] = isGlobalActor
    ? tags
    : tags.filter((tg) => actor.tagIds.includes(tg.id));

  // The actor may act on a target only when it strictly outranks it and it's not
  // the actor itself (no self-remove/re-role).
  const canActOn = (target: UserRow) =>
    target.id !== actor.id && RANK[actor.role] > RANK[target.role];

  async function confirmDelete() {
    if (!confirmUser) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${confirmUser.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== confirmUser.id));
        setConfirmUser(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("list.email")}</TableHead>
            <TableHead>{t("list.role")}</TableHead>
            <TableHead>{t("list.scope")}</TableHead>
            <TableHead className="text-right">{t("list.actions")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((u) =>
            editingId === u.id ? (
              <EditRow
                key={u.id}
                user={u}
                grantableCountries={grantableCountries}
                grantableTags={grantableTags}
                onCancel={() => setEditingId(null)}
                onSaved={(updated) => {
                  setUsers((prev) =>
                    prev.map((x) => (x.id === updated.id ? updated : x)),
                  );
                  setEditingId(null);
                }}
              />
            ) : (
              <TableRow key={u.id}>
                <TableCell>
                  <span className="font-medium">{u.email}</span>
                  {u.id === actor.id ? (
                    <span className="ml-2 text-xs text-foreground-muted">
                      {t("list.you")}
                    </span>
                  ) : null}
                </TableCell>
                <TableCell>{roleLabel(u.role)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {u.countries.map((c) => (
                      <Badge key={c} tone="neutral">
                        {c}
                      </Badge>
                    ))}
                    {u.tagIds.map((id) => (
                      <Badge key={id} tone="primary">
                        {tagLabel(id)}
                      </Badge>
                    ))}
                    {u.countries.length === 0 && u.tagIds.length === 0 ? (
                      <span className="text-xs text-foreground-muted">
                        {u.role === "SuperAdmin" || u.role === "Admin"
                          ? t("list.global")
                          : "—"}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-right">
                  {canActOn(u) ? (
                    <div className="inline-flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(u.id)}
                      >
                        {t("actions.edit")}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger hover:bg-danger/10"
                        onClick={() => setConfirmUser(u)}
                      >
                        {t("actions.remove")}
                      </Button>
                    </div>
                  ) : (
                    <span className="text-xs text-foreground-muted">
                      {t("list.noActions")}
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ),
          )}
        </TableBody>
      </Table>

      {confirmUser ? (
        <ConfirmRemoveModal
          email={confirmUser.email}
          deleting={deleting}
          onCancel={() => setConfirmUser(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </div>
  );
}

/** Inline editor for one user — role select + country & tag multiselects. */
function EditRow({
  user,
  grantableCountries,
  grantableTags,
  onCancel,
  onSaved,
}: {
  user: UserRow;
  grantableCountries: CountryCode[];
  grantableTags: Tag[];
  onCancel: () => void;
  onSaved: (u: UserRow) => void;
}) {
  const t = useTranslations("users");
  const tRoles = useTranslations("roles");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<UserErrorKey | null>(null);

  const roleOptions: DefaultOption[] = useMemo(
    () =>
      ROLES.map((r) => ({
        id: r,
        label: tRoles(r.charAt(0).toLowerCase() + r.slice(1)),
      })),
    [tRoles],
  );
  const countryOptions: DefaultOption[] = useMemo(
    () =>
      grantableCountries.map((c) => ({
        id: c,
        label: `${c} · ${countryNames[c]}`,
      })),
    [grantableCountries],
  );
  const tagOptions: DefaultOption[] = useMemo(
    () => grantableTags.map((tg) => ({ id: tg.id, label: tg.label })),
    [grantableTags],
  );

  const [role, setRole] = useState<DefaultOption | null>(
    roleOptions.find((o) => o.id === user.role) ?? null,
  );
  const [countries, setCountries] = useState<DefaultOption[]>(
    countryOptions.filter((o) => user.countries.includes(o.id as CountryCode)),
  );
  const [tagSel, setTagSel] = useState<DefaultOption[]>(
    tagOptions.filter((o) => user.tagIds.includes(String(o.id))),
  );

  async function save() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch(`/api/users/${user.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: role?.id ?? user.role,
          countries: countries.map((c) => String(c.id)),
          tagIds: tagSel.map((tg) => String(tg.id)),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: UserErrorKey;
      };
      if (res.ok) {
        onSaved({
          ...user,
          role: (role?.id as Role) ?? user.role,
          countries: countries.map((c) => c.id as CountryCode),
          tagIds: tagSel.map((tg) => String(tg.id)),
        });
        return;
      }
      setError(data.error ?? "unknown");
    } catch {
      setError("unknown");
    } finally {
      setPending(false);
    }
  }

  return (
    <TableRow>
      <TableCell className="align-top">
        <span className="font-medium">{user.email}</span>
      </TableCell>
      <TableCell className="align-top">
        <Field>
          <FieldLabel htmlFor={`role-${user.id}`}>{t("edit.role")}</FieldLabel>
          <Combobox
            id={`role-${user.id}`}
            options={roleOptions}
            value={role}
            onChange={setRole}
            searchable={false}
          />
        </Field>
      </TableCell>
      <TableCell className="align-top">
        <div className="flex flex-col gap-2">
          <Field>
            <FieldLabel htmlFor={`countries-${user.id}`}>
              {t("edit.countries")}
            </FieldLabel>
            <Combobox<DefaultOption>
              id={`countries-${user.id}`}
              multiple
              options={countryOptions}
              value={countries}
              onChange={setCountries}
              searchable={countryOptions.length > 6}
              placeholder={t("edit.countriesPlaceholder")}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor={`tags-${user.id}`}>{t("edit.tags")}</FieldLabel>
            <Combobox<DefaultOption>
              id={`tags-${user.id}`}
              multiple
              options={tagOptions}
              value={tagSel}
              onChange={setTagSel}
              searchable={tagOptions.length > 6}
              placeholder={t("edit.tagsPlaceholder")}
            />
          </Field>
          {error ? <FieldError>{t(`errors.${error}`)}</FieldError> : null}
        </div>
      </TableCell>
      <TableCell className="text-right align-top">
        <div className="inline-flex gap-2">
          <Button size="sm" onClick={save} loading={pending}>
            {t("actions.save")}
          </Button>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            {t("actions.cancel")}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** In-app remove confirm — never window.confirm (CAVEATS). */
function ConfirmRemoveModal({
  email,
  deleting,
  onCancel,
  onConfirm,
}: {
  email: string;
  deleting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const t = useTranslations("users");
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold tracking-tight">
          {t("remove.title")}
        </h2>
        <Alert tone="danger" className="my-4">
          <AlertBody>{t("remove.body", { email })}</AlertBody>
        </Alert>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel} disabled={deleting}>
            {t("actions.cancel")}
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={deleting}>
            {t("actions.remove")}
          </Button>
        </div>
      </div>
    </div>
  );
}
