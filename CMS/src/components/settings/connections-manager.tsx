"use client";

/**
 * MCP connections manager (cms-mcp → OAuth; replaces the API-key manager). Lists
 * the signed-in user's active OAuth grants for this Site (client name, created,
 * last used, expiry) with revoke, and shows the copy-pasteable Claude Code wiring
 * — no secrets involved: the client discovers this Site's authorization server
 * and runs the browser login/consent flow itself.
 *
 * REST-only (`GET/DELETE /api/oauth/connections`). Revoke uses the shared in-app
 * `ConfirmModal` — never native confirm() (CAVEATS). Purpose-token utilities only.
 */
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ConfirmModal } from "@/components/content/confirm-modal";
import type { ConnectionItem } from "@/lib/oauth/store";

function fmt(ts: number | null): string {
  return ts == null ? "—" : new Date(ts).toLocaleDateString();
}

export function ConnectionsManager({ mcpUrl }: { mcpUrl: string }) {
  const t = useTranslations("connections");
  const [items, setItems] = useState<ConnectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ConnectionItem | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/oauth/connections");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as ConnectionItem[];
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError((err as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirmRevoke() {
    if (!revoking) return;
    const id = revoking.id;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/oauth/connections?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setItems((prev) => prev.filter((c) => c.id !== id));
      setRevoking(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // A stable, URL-derived server name so several sites can coexist in one config
  // ("restovista.fi" → "restovista-fi").
  const serverName = (() => {
    try {
      return new URL(mcpUrl).host.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase() || "bizbee-site";
    } catch {
      return "bizbee-site";
    }
  })();

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p role="alert" className="rounded-md border border-danger bg-danger-subtle px-3 py-2 text-danger">
          {error}
        </p>
      )}

      <section className="flex flex-col gap-3">
        <header>
          <h2 className="text-lg font-semibold text-foreground">{t("listTitle")}</h2>
          <p className="text-sm text-foreground-muted">{t("listDescription")}</p>
        </header>
        {loading ? (
          <p className="text-foreground-muted">{t("loading")}</p>
        ) : items.length === 0 ? (
          <p className="text-foreground-muted">{t("empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {items.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border bg-surface-raised px-3 py-2"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-foreground">{c.clientName}</span>
                  <span className="text-sm text-foreground-muted">
                    {t("createdAt", { date: fmt(c.createdAt) })} ·{" "}
                    {t("lastUsedAt", { date: fmt(c.lastUsedAt) })} ·{" "}
                    {t("expiresAt", { date: fmt(c.refreshExpiresAt) })}
                  </span>
                </div>
                <button
                  type="button"
                  className="rounded border border-border px-3 py-1 text-danger disabled:opacity-40"
                  disabled={busy}
                  onClick={() => setRevoking(c)}
                >
                  {t("revoke")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Connect Claude Code — copy-pasteable wiring for this site's MCP server */}
      <section className="mt-2 flex flex-col gap-3 rounded-md border border-border bg-surface-raised p-4">
        <header>
          <h2 className="text-lg font-semibold text-foreground">{t("connectTitle")}</h2>
          <p className="mt-1 text-sm text-foreground-muted">{t("connectIntro")}</p>
        </header>
        <CopyBlock label={t("connectCliLabel")} copyLabel={t("copy")}>
          {`claude mcp add --scope user --transport http ${serverName} ${mcpUrl}`}
        </CopyBlock>
        <CopyBlock label={t("connectJsonLabel")} copyLabel={t("copy")}>
          {`{
  "mcpServers": {
    "${serverName}": { "type": "http", "url": "${mcpUrl}" }
  }
}`}
        </CopyBlock>
        <p className="text-sm text-foreground-muted">{t("connectHint", { server: serverName })}</p>
      </section>

      {revoking && (
        <ConfirmModal
          title={t("revokeTitle")}
          message={t("revokeConfirm", { client: revoking.clientName })}
          confirmLabel={t("revoke")}
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

function CopyBlock({
  children,
  label,
  copyLabel,
}: {
  children: string;
  label: string;
  copyLabel: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium uppercase tracking-wide text-foreground-muted">{label}</span>
      <div className="relative">
        <pre className="overflow-x-auto rounded-md border border-border bg-surface px-3 py-2 pr-20 font-mono text-xs text-foreground">
          {children}
        </pre>
        <button
          type="button"
          className="absolute right-2 top-2 rounded border border-border bg-surface-raised px-2 py-1 text-xs text-foreground"
          onClick={() => {
            void navigator.clipboard?.writeText(children);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "✓" : copyLabel}
        </button>
      </div>
    </div>
  );
}
