"use client";

/**
 * CMS user-management UI (cms-auth Slice 5). Lists CMS users + pending invites,
 * invites by email + role, changes a user's role inline, removes a user, and
 * revokes an invite — talking to `GET /api/users`, `POST /api/invite`,
 * `PATCH/DELETE /api/users/[id]`, and `DELETE /api/invite/[id]`.
 *
 * Per-row controls are computed by the SAME pure helper the server enforces
 * with (`userRowControls`) — the UI never offers a control the server would 403.
 * Role/invite removals use the shared in-app `ConfirmModal` — NEVER native
 * confirm()/alert() (those hang browser-automation review sessions; CAVEAT).
 *
 * REST-only (no server actions). Copy via next-intl (EN/FI/ET). Purpose-token
 * Tailwind utilities only.
 *
 * ponytail: client fetch + local list mutation, no data lib. Server is the
 * validation source of truth; the client just disables impossible controls.
 */

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "@/components/content/confirm-modal";
import { userRowControls, ASSIGNABLE_ROLES } from "@/lib/auth/user-mgmt";
import { canInviteRole } from "@/lib/auth/roles";
import type { CmsRole } from "@/db/schema";
import type {
  UsersResponse,
  UserListItem,
  PendingInviteItem,
} from "@/app/api/users/route";

function fmt(ts: number): string {
  return new Date(ts).toLocaleDateString();
}

export function UsersManager() {
  const t = useTranslations("users");
  const tr = useTranslations("roles");
  const [data, setData] = useState<UsersResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Invite form.
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<CmsRole>("Editor");
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);

  // Pending confirmations.
  const [removing, setRemoving] = useState<UserListItem | null>(null);
  const [revoking, setRevoking] = useState<PendingInviteItem | null>(null);

  const roleLabel = (r: CmsRole): string =>
    tr(`${r.charAt(0).toLowerCase()}${r.slice(1)}` as Parameters<typeof tr>[0]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((await res.json()) as UsersResponse);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  // Which roles the signed-in actor may grant through an invite.
  const invitableRoles: CmsRole[] = data
    ? ASSIGNABLE_ROLES.filter((r) => canInviteRole(data.me.role, r))
    : [];

  // Keep the invite-role select on a value the actor may actually grant.
  useEffect(() => {
    if (invitableRoles.length > 0 && !invitableRoles.includes(inviteRole)) {
      setInviteRole(invitableRoles[invitableRoles.length - 1]);
    }
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  async function invite() {
    setBusy(true);
    setError(null);
    setInviteNotice(null);
    try {
      const res = await fetch("/api/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        success?: { delivered: boolean };
      };
      if (!res.ok) throw new Error(j.error ? t(`err.${j.error}`) : `HTTP ${res.status}`);
      setInviteEmail("");
      setInviteNotice(
        j.success?.delivered ? t("inviteSent") : t("inviteCreatedNoEmail"),
      );
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(u: UserListItem, role: CmsRole) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(u.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((x) => (x.id === u.id ? { ...x, role } : x)),
            }
          : prev,
      );
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRemove() {
    if (!removing) return;
    const id = removing.id;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((prev) =>
        prev ? { ...prev, users: prev.users.filter((x) => x.id !== id) } : prev,
      );
      setRemoving(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirmRevoke() {
    if (!revoking) return;
    const id = revoking.id;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData((prev) =>
        prev
          ? { ...prev, invites: prev.invites.filter((x) => x.id !== id) }
          : prev,
      );
      setRevoking(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-foreground-muted">{t("loading")}</p>;
  if (!data)
    return (
      <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
        {error ?? t("loadFailed")}
      </p>
    );

  const me = data.me;

  return (
    <div className="flex flex-col gap-6">
      {/* Invite */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("inviteHeading")}</h2>
        {invitableRoles.length === 0 ? (
          <p className="text-sm text-foreground-muted">{t("cannotInvite")}</p>
        ) : (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void invite();
            }}
          >
            <input
              type="email"
              className="min-w-48 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-foreground"
              placeholder={t("emailPlaceholder")}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              aria-label={t("emailPlaceholder")}
            />
            <select
              className="rounded-md border border-border bg-surface px-3 py-2 text-foreground"
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as CmsRole)}
              aria-label={t("roleLabel")}
            >
              {invitableRoles.map((r) => (
                <option key={r} value={r}>
                  {roleLabel(r)}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50"
              disabled={busy || inviteEmail.trim() === ""}
            >
              {busy ? t("inviting") : t("invite")}
            </button>
          </form>
        )}
        {inviteNotice && (
          <p className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm text-foreground-muted">
            {inviteNotice}
          </p>
        )}
      </section>

      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
          {error}
        </p>
      )}

      {/* Users */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-foreground">{t("usersHeading")}</h2>
        <ul className="flex flex-col gap-2">
          {data.users.map((u) => {
            const ctrl = userRowControls(me, { id: u.id, role: u.role });
            return (
              <li
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">
                    {u.email}
                    {ctrl.isSelf && (
                      <span className="ml-2 text-sm text-foreground-muted">
                        ({t("you")})
                      </span>
                    )}
                  </span>
                  <span className="text-sm text-foreground-muted">
                    {u.ssoOnly ? t("ssoUser") : t("passwordUser")} ·{" "}
                    {t("joined", { date: fmt(u.createdAt) })}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {ctrl.canChangeRole ? (
                    <select
                      className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-foreground disabled:opacity-50"
                      value={u.role}
                      disabled={busy}
                      aria-label={t("roleLabel")}
                      onChange={(e) =>
                        void changeRole(u, e.target.value as CmsRole)
                      }
                    >
                      {ctrl.roleOptions.map((r) => (
                        <option key={r} value={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <span className="rounded bg-surface px-2 py-1 text-sm text-foreground-muted">
                      {roleLabel(u.role)}
                    </span>
                  )}
                  {ctrl.canRemove && (
                    <button
                      type="button"
                      className="rounded border border-border px-3 py-1 text-sm text-danger disabled:opacity-40"
                      disabled={busy}
                      onClick={() => setRemoving(u)}
                    >
                      {t("remove")}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* Pending invites */}
      {data.invites.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-foreground">
            {t("pendingHeading")}
          </h2>
          <ul className="flex flex-col gap-2">
            {data.invites.map((inv) => (
              <li
                key={inv.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">
                    {inv.email}
                  </span>
                  <span className="text-sm text-foreground-muted">
                    {roleLabel(inv.role)} ·{" "}
                    {t("expires", { date: fmt(inv.expiresAt) })}
                  </span>
                </div>
                <button
                  type="button"
                  className="rounded border border-border px-3 py-1 text-sm text-danger disabled:opacity-40"
                  disabled={busy}
                  onClick={() => setRevoking(inv)}
                >
                  {t("revokeInvite")}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {removing && (
        <ConfirmModal
          message={t("removeConfirm", { email: removing.email })}
          confirmLabel={t("remove")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(null)}
        />
      )}
      {revoking && (
        <ConfirmModal
          message={t("revokeConfirm", { email: revoking.email })}
          confirmLabel={t("revokeInvite")}
          cancelLabel={t("cancel")}
          danger
          busy={busy}
          onConfirm={() => void confirmRevoke()}
          onCancel={() => setRevoking(null)}
        />
      )}
    </div>
  );
}
